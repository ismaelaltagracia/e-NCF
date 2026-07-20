import { Inject, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
// eslint-disable-next-line @typescript-eslint/no-require-imports
import PDFDocument = require('pdfkit');
import { type IPdfGeneratorService } from './pdf-generator.interface.js';
import { type IQrGeneratorService, QR_GENERATOR } from './qr-generator.interface.js';
import { type IStorageProvider, STORAGE_PROVIDER } from '../storage/storage.interface.js';
import { FacturaElectronica } from '../../database/entities/factura-electronica.entity.js';

/**
 * Servicio para la generación de PDFs de facturas electrónicas.
 *
 * Soporta dos formatos:
 * - ticket: 80mm de ancho (~226.77pt)
 * - carta: tamaño letter (612x792pt)
 *
 * Incluye: código QR (mínimo 25x25mm), encabezado con nombre empresa,
 * RNC emisor y receptor, detalle de ítems con ITBIS, totales, e-NCF y Track_ID.
 *
 * @see Requisito 15.1, 15.2, 15.3, 15.4, 15.5, 15.6
 */
@Injectable()
export class PdfGeneratorService implements IPdfGeneratorService {
  private readonly logger = new Logger(PdfGeneratorService.name);

  /** Ancho en puntos para formato ticket (80mm ≈ 226.77pt) */
  private static readonly TICKET_WIDTH = 226.77;

  /** Tamaño mínimo del QR en puntos (25mm ≈ 70.87pt) */
  private static readonly QR_MIN_SIZE = 70.87;

  /** Bucket de S3/MinIO para almacenar PDFs de facturas */
  private static readonly PDF_BUCKET = 'facturas-pdf';

  /** Timeout para subida a S3 en milisegundos (30s) */
  private static readonly UPLOAD_TIMEOUT_MS = 30_000;

  /** Número máximo de reintentos para subida a S3 */
  private static readonly MAX_UPLOAD_RETRIES = 3;

  constructor(
    @Inject(QR_GENERATOR)
    private readonly qrGenerator: IQrGeneratorService,
    @Inject(STORAGE_PROVIDER)
    private readonly storageProvider: IStorageProvider,
    @InjectRepository(FacturaElectronica)
    private readonly facturaRepository: Repository<FacturaElectronica>,
  ) {}

  /**
   * Genera un PDF de factura electrónica en el formato especificado.
   */
  async generarFacturaPdf(
    factura: FacturaElectronica,
    formato: 'ticket' | 'carta',
  ): Promise<Buffer> {
    const qrBuffer = await this.qrGenerator.generar({
      url_dgii: 'https://dgii.gov.do/app/WebApps/ConsultaNCF/ConsultaNCF',
      rnc_emisor: factura.empresa?.rnc ?? '',
      rnc_receptor: this.extractRncReceptor(factura),
      encf: factura.e_ncf ?? '',
      monto_total: this.extractMontoTotal(factura),
    });

    const doc = this.createDocument(formato);
    const chunks: Buffer[] = [];

    return new Promise<Buffer>((resolve, reject) => {
      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      this.renderHeader(doc, factura, formato);
      this.renderRncs(doc, factura);
      this.renderItems(doc, factura, formato);
      this.renderTotals(doc, factura);
      this.renderQr(doc, qrBuffer, formato);
      this.renderFooter(doc, factura);

      doc.end();
    });
  }

  /**
   * Genera el PDF y lo sube al almacenamiento de objetos con reintentos.
   */
  async generarYSubirPdf(facturaId: string): Promise<void> {
    const factura = await this.facturaRepository.findOne({
      where: { id: facturaId },
      relations: ['empresa'],
    });

    if (!factura) {
      this.logger.error(`Factura no encontrada: ${facturaId}`);
      return;
    }

    const formato = (factura.empresa?.formato_pdf as 'ticket' | 'carta') || 'carta';
    const pdfBuffer = await this.generarFacturaPdf(factura, formato);

    const key = `${factura.empresa_id}/${factura.id}.pdf`;
    const url = await this.uploadWithRetry(pdfBuffer, key);

    await this.facturaRepository.update(factura.id, { pdf_s3_url: url });
    this.logger.log(`PDF generado y subido para factura ${facturaId}: ${url}`);
  }

  /**
   * Sube el PDF a S3/MinIO con reintentos (hasta 3 intentos, timeout 30s).
   */
  private async uploadWithRetry(pdfBuffer: Buffer, key: string): Promise<string> {
    let lastError: Error | undefined;

    for (let attempt = 1; attempt <= PdfGeneratorService.MAX_UPLOAD_RETRIES; attempt++) {
      try {
        const url = await this.uploadWithTimeout(pdfBuffer, key);
        return url;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        this.logger.warn(
          `Intento ${attempt}/${PdfGeneratorService.MAX_UPLOAD_RETRIES} de subida fallido para ${key}: ${lastError.message}`,
        );
      }
    }

    throw new Error(
      `Fallo al subir PDF después de ${PdfGeneratorService.MAX_UPLOAD_RETRIES} intentos: ${lastError?.message}`,
    );
  }

  /**
   * Sube el PDF con timeout de 30 segundos.
   */
  private uploadWithTimeout(pdfBuffer: Buffer, key: string): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Timeout de subida excedido (30s)'));
      }, PdfGeneratorService.UPLOAD_TIMEOUT_MS);

      this.storageProvider
        .upload(PdfGeneratorService.PDF_BUCKET, key, pdfBuffer, 'application/pdf')
        .then((url) => {
          clearTimeout(timeout);
          resolve(url);
        })
        .catch((error) => {
          clearTimeout(timeout);
          reject(error);
        });
    });
  }

  /**
   * Crea el documento PDF según el formato.
   */
  private createDocument(formato: 'ticket' | 'carta'): PDFKit.PDFDocument {
    if (formato === 'ticket') {
      return new PDFDocument({
        size: [PdfGeneratorService.TICKET_WIDTH, 841.89],
        margins: { top: 10, bottom: 10, left: 10, right: 10 },
      });
    }

    return new PDFDocument({
      size: 'LETTER',
      margins: { top: 50, bottom: 50, left: 50, right: 50 },
    });
  }

  /**
   * Renderiza el encabezado con nombre de empresa.
   */
  private renderHeader(
    doc: PDFKit.PDFDocument,
    factura: FacturaElectronica,
    formato: 'ticket' | 'carta',
  ): void {
    const empresaNombre = factura.empresa?.nombre ?? 'Empresa';
    const fontSize = formato === 'ticket' ? 10 : 16;

    doc.fontSize(fontSize).font('Helvetica-Bold').text(empresaNombre, { align: 'center' });
    doc.moveDown(0.5);
  }

  /**
   * Renderiza los RNC de emisor y receptor.
   */
  private renderRncs(doc: PDFKit.PDFDocument, factura: FacturaElectronica): void {
    const rncEmisor = factura.empresa?.rnc ?? 'N/A';
    const rncReceptor = this.extractRncReceptor(factura);

    doc.fontSize(9).font('Helvetica');
    doc.text(`RNC Emisor: ${rncEmisor}`);
    doc.text(`RNC Receptor: ${rncReceptor}`);
    doc.moveDown(0.5);
  }

  /**
   * Renderiza el detalle de ítems con ITBIS.
   */
  private renderItems(
    doc: PDFKit.PDFDocument,
    factura: FacturaElectronica,
    formato: 'ticket' | 'carta',
  ): void {
    const payload = factura.payload_json ?? {};
    const items = (payload['items'] as Array<Record<string, unknown>>) ?? [];

    doc.fontSize(8).font('Helvetica-Bold');

    if (formato === 'carta') {
      doc.text('Descripción          Cant.   Precio    ITBIS    Subtotal');
    } else {
      doc.text('Desc.   Cant.  Precio  ITBIS');
    }

    doc.font('Helvetica').fontSize(7);
    doc.moveDown(0.3);

    for (const item of items) {
      const descripcion = String(item['descripcion'] ?? item['nombre'] ?? '');
      const cantidad = Number(item['cantidad'] ?? 1);
      const precio = Number(item['precio'] ?? item['precio_unitario'] ?? 0);
      const itbis = Number(item['itbis'] ?? 0);
      const subtotal = cantidad * precio + itbis;

      if (formato === 'carta') {
        const line = `${descripcion.substring(0, 20).padEnd(20)} ${String(cantidad).padStart(5)} ${precio.toFixed(2).padStart(9)} ${itbis.toFixed(2).padStart(8)} ${subtotal.toFixed(2).padStart(10)}`;
        doc.text(line);
      } else {
        doc.text(`${descripcion.substring(0, 15)} x${cantidad} $${precio.toFixed(2)} ITBIS:$${itbis.toFixed(2)}`);
      }
    }

    doc.moveDown(0.5);
  }

  /**
   * Renderiza los totales de la factura.
   */
  private renderTotals(doc: PDFKit.PDFDocument, factura: FacturaElectronica): void {
    const payload = factura.payload_json ?? {};
    const montoTotal = Number(payload['monto_total'] ?? payload['total'] ?? 0);
    const itbisTotal = Number(payload['itbis_total'] ?? payload['total_itbis'] ?? 0);
    const subtotal = montoTotal - itbisTotal;

    doc.fontSize(9).font('Helvetica');
    doc.text(`Subtotal: $${subtotal.toFixed(2)}`, { align: 'right' });
    doc.text(`ITBIS Total: $${itbisTotal.toFixed(2)}`, { align: 'right' });
    doc.font('Helvetica-Bold');
    doc.text(`Total: $${montoTotal.toFixed(2)}`, { align: 'right' });
    doc.moveDown(0.5);
  }

  /**
   * Renderiza el código QR (mínimo 25x25mm ≈ 71pt).
   */
  private renderQr(
    doc: PDFKit.PDFDocument,
    qrBuffer: Buffer,
    formato: 'ticket' | 'carta',
  ): void {
    const qrSize = PdfGeneratorService.QR_MIN_SIZE;
    const xPosition =
      formato === 'ticket'
        ? (PdfGeneratorService.TICKET_WIDTH - qrSize) / 2
        : doc.page.width / 2 - qrSize / 2;

    doc.image(qrBuffer, xPosition, doc.y, {
      width: qrSize,
      height: qrSize,
    });
    doc.y += qrSize + 5;
  }

  /**
   * Renderiza el pie con e-NCF, Track_ID y Código de Seguridad.
   */
  private renderFooter(doc: PDFKit.PDFDocument, factura: FacturaElectronica): void {
    const payload = factura.payload_json ?? {};
    const codigoSeguridad = String(payload['codigo_seguridad'] || '');

    doc.fontSize(8).font('Helvetica');
    if (codigoSeguridad) {
      doc.text(`Código de Seguridad: ${codigoSeguridad}`, { align: 'center' });
    }
    doc.text(`e-NCF: ${factura.e_ncf ?? 'N/A'}`, { align: 'center' });
    doc.text(`Track_ID: ${factura.track_id ?? 'N/A'}`, { align: 'center' });
  }

  /**
   * Extrae el RNC del receptor del payload JSON de la factura.
   */
  private extractRncReceptor(factura: FacturaElectronica): string {
    const payload = factura.payload_json ?? {};
    return String(
      payload['rnc_receptor'] ?? payload['rnc_comprador'] ?? payload['RncComprador'] ?? 'N/A',
    );
  }

  /**
   * Extrae el monto total formateado del payload JSON de la factura.
   */
  private extractMontoTotal(factura: FacturaElectronica): string {
    const payload = factura.payload_json ?? {};
    const total = Number(payload['monto_total'] ?? payload['total'] ?? 0);
    return total.toFixed(2);
  }
}
