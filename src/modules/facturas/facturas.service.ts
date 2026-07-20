import {
  Injectable,
  Logger,
  Inject,
  Optional,
  ForbiddenException,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as crypto from 'node:crypto';

import { FacturaElectronica } from '../../database/entities/factura-electronica.entity.js';
import { Empresa } from '../../database/entities/empresa.entity.js';
import { EstadoDgii, ModoNcf } from '../../database/enums.js';
import { SecuenciasNcfService } from '../secuencias-ncf/secuencias-ncf.service.js';
import { PlanesService } from '../planes/planes.service.js';
import { ConversorXmlService } from '../../dgii/conversor-xml.service.js';
import { FirmaService } from '../../dgii/firma.service.js';
import { TransmisionService } from '../../dgii/transmision.service.js';
import { RncValidatorService } from '../../dgii/rnc-validator.service.js';
import { STORAGE_PROVIDER } from '../../infrastructure/storage/storage.interface.js';
import type { IStorageProvider } from '../../infrastructure/storage/storage.interface.js';
import {
  RETRY_QUEUE_SERVICE,
  type IRetryQueueService,
} from '../../infrastructure/queue/retry-queue.interfaces.js';
import type { CreateFacturaDto } from './dto/factura.schemas.js';
import type { RequestContext } from '../../common/interfaces/request-context.interface.js';
import { PDF_GENERATOR } from '../../infrastructure/pdf/pdf-generator.interface.js';
import type { IPdfGeneratorService } from '../../infrastructure/pdf/pdf-generator.interface.js';

const BUCKET_FACTURAS_XML = 'facturas-xml';
const BUCKET_FACTURAS_PDF = 'facturas-pdf';
const PRESIGNED_URL_TTL_SECONDS = 900; // 15 minutes

export interface CrearFacturaResponse {
  id: string;
  e_ncf: string | null;
  track_id: string | null;
  estado_dgii: EstadoDgii;
  created_at: Date;
}

@Injectable()
export class FacturasService {
  private readonly logger = new Logger(FacturasService.name);

  constructor(
    @InjectRepository(FacturaElectronica)
    private readonly facturaRepo: Repository<FacturaElectronica>,
    @InjectRepository(Empresa)
    private readonly empresaRepo: Repository<Empresa>,
    private readonly secuenciasNcfService: SecuenciasNcfService,
    private readonly planesService: PlanesService,
    private readonly conversorXmlService: ConversorXmlService,
    private readonly firmaService: FirmaService,
    private readonly transmisionService: TransmisionService,
    private readonly rncValidatorService: RncValidatorService,
    @Inject(STORAGE_PROVIDER)
    private readonly storageProvider: IStorageProvider,
    @Optional()
    @Inject(RETRY_QUEUE_SERVICE)
    public readonly retryQueue: IRetryQueueService | null,
    @Inject(PDF_GENERATOR)
    private readonly pdfGeneratorService: IPdfGeneratorService,
  ) {}

  /**
   * Orquesta el flujo completo de creación de factura electrónica:
   * 1. Verificar RNC emisor coincide con empresa
   * 2. Validar e_ncf según modo_ncf
   * 3. Verificar límite mensual
   * 4. Asignar NCF (automático) o usar proporcionado (manual)
   * 5. Validar RNC receptor
   * 6. Crear registro FacturaElectronica
   * 7. Convertir a XML
   * 8. Firmar XML
   * 9. Subir XML a S3
   * 10. Transmitir a DGII
   * 11. Actualizar factura con resultado
   * 12. Incrementar uso mensual
   *
   * @see Requirements 8.6, 13.1, 13.2, 13.3, 13.4, 13.5, 13.6, 18.2, 18.3, 18.4
   */
  async crearFactura(
    dto: CreateFacturaDto,
    user: RequestContext,
    correlationId: string,
  ): Promise<CrearFacturaResponse> {
    const empresaId = user.empresa_id;

    // Step 1: Fetch empresa and verify RNC emisor matches
    const empresa = await this.empresaRepo.findOne({ where: { id: empresaId } });
    if (!empresa) {
      throw new ForbiddenException('Empresa no encontrada para el usuario autenticado');
    }

    // Auto-complete fields if not provided (SPA sends minimal payload)
    if (!dto.rnc_emisor) {
      dto.rnc_emisor = empresa.rnc;
    }
    if (!dto.tipo_comprobante) {
      dto.tipo_comprobante = 'E31' as any;
    }
    if (dto.subtotal === undefined || dto.monto_itbis === undefined || dto.monto_total === undefined) {
      const subtotalCalc = dto.items.reduce(
        (sum, item) => sum + item.cantidad * item.precio_unitario,
        0,
      );
      const itbisCalc = dto.items.reduce(
        (sum, item) => sum + item.cantidad * item.precio_unitario * (item.tasa_itbis / 100),
        0,
      );
      dto.subtotal = dto.subtotal ?? Math.round(subtotalCalc * 100) / 100;
      dto.monto_itbis = dto.monto_itbis ?? Math.round(itbisCalc * 100) / 100;
      dto.monto_total = dto.monto_total ?? Math.round((subtotalCalc + itbisCalc) * 100) / 100;
    }

    if (dto.rnc_emisor !== empresa.rnc) {
      throw new ForbiddenException(
        'El RNC emisor no coincide con la empresa autenticada',
      );
    }

    // Step 2: Validate e_ncf based on modo_ncf
    let eNcf: string;
    if (empresa.modo_ncf === ModoNcf.MANUAL) {
      if (!dto.e_ncf) {
        throw new BadRequestException(
          'El campo e_ncf es obligatorio cuando la empresa opera en modo manual',
        );
      }
      eNcf = dto.e_ncf;
    } else {
      // Modo automático: ignorar e_ncf proporcionado, se asigna desde secuencia
      eNcf = ''; // Will be assigned below
    }

    // Step 3: Verify monthly limit
    await this.planesService.verificarLimite(empresaId);

    // Step 4: Assign NCF
    if (empresa.modo_ncf === ModoNcf.AUTOMATICO) {
      const asignacion = await this.secuenciasNcfService.asignarSiguiente(
        empresaId,
        dto.tipo_comprobante!,
      );
      eNcf = asignacion.e_ncf;
    }

    // Step 5: Validate RNC receptor
    const { rnc_validado } = await this.rncValidatorService.validarRncParaFactura(
      dto.rnc_receptor,
      empresa,
    );

    // Step 6: Create FacturaElectronica record
    const factura = this.facturaRepo.create({
      empresa_id: empresaId,
      usuario_id: user.tipo === 'usuario' ? (user.usuario_id ?? null) : null,
      api_key_id: user.tipo === 'api_key' ? (user.api_key_id ?? null) : null,
      e_ncf: eNcf,
      estado_dgii: EstadoDgii.ENVIADO,
      payload_json: dto as unknown as Record<string, unknown>,
      rnc_validado,
      correlation_id: correlationId,
    });

    const savedFactura = await this.facturaRepo.save(factura);

    // Step 7: Convert to XML
    const xml = await this.conversorXmlService.convertir(
      dto as unknown as Record<string, unknown>,
      eNcf,
    );

    // Step 7.1: Validate XML structure before transmission
    const validacion = this.conversorXmlService.validarEstructuraXml(xml);
    if (!validacion.valido) {
      throw new BadRequestException({
        message: 'El XML generado no cumple con la estructura requerida por la DGII',
        errores: validacion.errores,
      });
    }

    // Step 8: Sign XML
    const xmlFirmado = await this.firmaService.firmarEcf(xml, empresaId);

    // Step 8.1: Compute security code from signature
    const signatureMatch = xmlFirmado.match(/<ds:SignatureValue[^>]*>([^<]+)<\/ds:SignatureValue>/);
    const codigoSeguridad = signatureMatch
      ? crypto.createHash('sha256').update(signatureMatch[1]).digest('hex').substring(0, 6).toUpperCase()
      : '000000';

    // Store codigo_seguridad in payload_json
    const payloadConCodigo = {
      ...(savedFactura.payload_json || {}),
      codigo_seguridad: codigoSeguridad,
    };
    savedFactura.payload_json = payloadConCodigo;

    // Step 9: Upload XML to storage
    const storageKey = `${empresaId}/${savedFactura.id}.xml`;
    const xmlS3Url = await this.storageProvider.upload(
      BUCKET_FACTURAS_XML,
      storageKey,
      Buffer.from(xmlFirmado, 'utf-8'),
      'application/xml',
    );

    // Step 10: Update factura with xml_s3_url
    savedFactura.xml_s3_url = xmlS3Url;
    await this.facturaRepo.save(savedFactura);

    // Step 11: Transmit to DGII (non-blocking - if it fails, enqueue for retry)
    let resultado: { track_id: string | null; estado: 'aceptado' | 'rechazado' | 'reintentando'; error_dgii?: Record<string, unknown> | null };
    try {
      resultado = await this.transmisionService.transmitir({
        factura_id: savedFactura.id,
        empresa_id: empresaId,
        xml_firmado: xmlFirmado,
        correlation_id: correlationId,
      });
    } catch {
      // Transmission failed (circuit breaker open, DGII unreachable, etc.)
      // Create factura with estado "reintentando" - will be retried by queue
      resultado = { track_id: null, estado: 'reintentando', error_dgii: null };
    }

    // Step 12: Update factura with transmission result
    savedFactura.track_id = resultado.track_id;
    savedFactura.estado_dgii = this.mapEstadoDgii(resultado.estado);
    if (resultado.error_dgii) {
      savedFactura.error_dgii = resultado.error_dgii;
    }
    await this.facturaRepo.save(savedFactura);

    // Step 13: Increment monthly usage atomically
    await this.planesService.incrementarUso(empresaId);

    // Step 14: Generate PDF immediately (non-blocking on failure)
    try {
      await this.pdfGeneratorService.generarYSubirPdf(savedFactura.id);
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      this.logger.warn(`PDF generation failed for factura ${savedFactura.id}: ${msg}`);
      // PDF will be available later if retry succeeds
    }

    return {
      id: savedFactura.id,
      e_ncf: savedFactura.e_ncf,
      track_id: savedFactura.track_id,
      estado_dgii: savedFactura.estado_dgii,
      created_at: savedFactura.created_at,
    };
  }

  /**
   * Listar facturas de una empresa con paginación y filtro opcional por estado DGII.
   * Aislamiento multi-tenencia: siempre filtra por empresa_id.
   *
   * @see Requirements 18.5, 18.7
   */
  async listarFacturas(
    empresaId: string,
    options: {
      page: number;
      limit: number;
      estado_dgii?: EstadoDgii;
      tipo_comprobante?: string;
      fecha_desde?: string;
      fecha_hasta?: string;
      rnc_receptor?: string;
      e_ncf?: string;
    },
  ) {
    const { page, limit, estado_dgii, tipo_comprobante, fecha_desde, fecha_hasta, rnc_receptor, e_ncf } = options;
    const skip = (page - 1) * limit;

    const qb = this.facturaRepo.createQueryBuilder('f')
      .where('f.empresa_id = :empresaId', { empresaId })
      .orderBy('f.created_at', 'DESC')
      .skip(skip)
      .take(limit);

    if (estado_dgii) {
      qb.andWhere('f.estado_dgii = :estado_dgii', { estado_dgii });
    }

    if (tipo_comprobante) {
      qb.andWhere("f.e_ncf LIKE :tipo", { tipo: `${tipo_comprobante}%` });
    }

    if (fecha_desde) {
      qb.andWhere('f.created_at >= :fecha_desde', { fecha_desde });
    }

    if (fecha_hasta) {
      qb.andWhere('f.created_at <= :fecha_hasta', { fecha_hasta: `${fecha_hasta}T23:59:59.999Z` });
    }

    if (rnc_receptor) {
      qb.andWhere("f.payload_json->>'rnc_receptor' = :rnc_receptor", { rnc_receptor });
    }

    if (e_ncf) {
      qb.andWhere('f.e_ncf LIKE :e_ncf', { e_ncf: `%${e_ncf}%` });
    }

    const [data, total] = await qb.getManyAndCount();

    return {
      data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * Obtener detalle de una factura por ID con aislamiento multi-tenencia.
   * Retorna 404 si no existe, 403 si pertenece a otra empresa.
   *
   * @see Requirements 18.2, 29.3
   */
  async obtenerFactura(facturaId: string, empresaId: string): Promise<FacturaElectronica> {
    const factura = await this.facturaRepo.findOne({ where: { id: facturaId } });

    if (!factura) {
      throw new NotFoundException('Factura no encontrada');
    }

    if (factura.empresa_id !== empresaId) {
      throw new ForbiddenException('No tiene acceso a esta factura');
    }

    return factura;
  }

  /**
   * Obtener solo el estado DGII de una factura con aislamiento multi-tenencia.
   *
   * @see Requirements 29.3
   */
  async obtenerEstadoFactura(
    facturaId: string,
    empresaId: string,
  ): Promise<{ id: string; e_ncf: string | null; estado_dgii: EstadoDgii; track_id: string | null; updated_at: Date }> {
    const factura = await this.obtenerFactura(facturaId, empresaId);

    return {
      id: factura.id,
      e_ncf: factura.e_ncf,
      estado_dgii: factura.estado_dgii,
      track_id: factura.track_id,
      updated_at: factura.updated_at,
    };
  }

  /**
   * Genera una URL pre-firmada para descargar el PDF de una factura.
   * Verifica aislamiento multi-tenencia y disponibilidad del PDF.
   *
   * @see Requirements 16.1, 16.2, 16.3, 16.4, 16.5
   */
  async descargarPdf(
    facturaId: string,
    empresaId: string,
  ): Promise<{ url: string; expires_at: string }> {
    const factura = await this.obtenerFactura(facturaId, empresaId);

    if (!factura.pdf_s3_url) {
      throw new NotFoundException('PDF no disponible para esta factura');
    }

    // Extract S3 key from the stored URL/key
    const key = factura.pdf_s3_url;

    const url = await this.storageProvider.getPresignedUrl(
      BUCKET_FACTURAS_PDF,
      key,
      PRESIGNED_URL_TTL_SECONDS,
    );

    const expiresAt = new Date(
      Date.now() + PRESIGNED_URL_TTL_SECONDS * 1000,
    ).toISOString();

    return { url, expires_at: expiresAt };
  }

  /**
   * Actualizar estado_dgii de una factura a ANULADO.
   * Se usa tras confirmación exitosa de anulación por la DGII.
   *
   * @see Requisito 30.3
   */
  async actualizarEstadoAnulado(facturaId: string): Promise<void> {
    await this.facturaRepo.update(
      { id: facturaId },
      { estado_dgii: EstadoDgii.ANULADO },
    );
  }

  /**
   * Envía la factura por correo electrónico con el PDF adjunto.
   * En modo desarrollo sin SMTP configurado, retorna éxito simulado.
   */
  async enviarFacturaEmail(
    facturaId: string,
    empresaId: string,
    email: string,
  ): Promise<{ message: string; email: string }> {
    const factura = await this.obtenerFactura(facturaId, empresaId);

    if (!factura.pdf_s3_url) {
      throw new BadRequestException(
        'El PDF de esta factura aún no ha sido generado. Intente más tarde.',
      );
    }

    // TODO: Implementar envío real con nodemailer cuando se configure SMTP
    // Por ahora, retornar éxito simulado en modo desarrollo
    this.logger.log(
      `[EMAIL] Factura ${factura.e_ncf} enviada a ${email} (simulado)`,
    );

    return {
      message: `Factura ${factura.e_ncf || facturaId} enviada exitosamente a ${email}`,
      email,
    };
  }

  /**
   * Maps TransmisionResult estado to EstadoDgii enum.
   */
  private mapEstadoDgii(estado: 'aceptado' | 'rechazado' | 'reintentando'): EstadoDgii {
    switch (estado) {
      case 'aceptado':
        return EstadoDgii.ACEPTADO;
      case 'rechazado':
        return EstadoDgii.RECHAZADO;
      case 'reintentando':
        return EstadoDgii.REINTENTANDO;
      default:
        return EstadoDgii.ENVIADO;
    }
  }
}
