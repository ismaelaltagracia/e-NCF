import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between } from 'typeorm';
import { FacturaElectronica } from '../../database/entities/factura-electronica.entity.js';
import { FacturaRecibida } from '../../database/entities/factura-recibida.entity.js';
import { Empresa } from '../../database/entities/empresa.entity.js';
import { EstadoDgii } from '../../database/enums.js';

/**
 * Servicio de generación de reportes fiscales DGII (606, 607, 608).
 *
 * Formato de archivo TXT según especificación DGII:
 * - Separador de campo: pipe (|)
 * - Primera línea: encabezado con RNC emisor, período, cantidad de registros
 * - Líneas siguientes: detalle
 */
@Injectable()
export class ReportesService {
  constructor(
    @InjectRepository(FacturaElectronica)
    private readonly facturaRepo: Repository<FacturaElectronica>,
    @InjectRepository(FacturaRecibida)
    private readonly facturaRecibidaRepo: Repository<FacturaRecibida>,
    @InjectRepository(Empresa)
    private readonly empresaRepo: Repository<Empresa>,
  ) {}

  /**
   * Genera el formato 606 (Compras y Gastos) para un período mensual.
   * Incluye todas las facturas recibidas (compras) del mes.
   */
  async generar606(empresaId: string, anio: number, mes: number): Promise<{ contenido: string; cantidad: number }> {
    const empresa = await this.empresaRepo.findOneOrFail({ where: { id: empresaId } });
    const { desde, hasta } = this.getRangoMes(anio, mes);

    const compras = await this.facturaRecibidaRepo.find({
      where: {
        empresa_id: empresaId,
        fecha_emision: Between(desde, hasta) as any,
      },
      order: { fecha_emision: 'ASC' },
    });

    const periodo = `${anio}${String(mes).padStart(2, '0')}`;
    const lineas: string[] = [];

    // Header: 606|RNC|Periodo|Cantidad
    lineas.push(`606|${empresa.rnc}|${periodo}|${compras.length}`);

    // Detail lines
    for (const compra of compras) {
      const fechaDoc = this.formatFecha(compra.fecha_emision);
      const montoTotal = Number(compra.monto_total);
      // Estimate ITBIS at 18% for simplicity (factura recibida doesn't store ITBIS breakdown)
      const itbis = Math.round(montoTotal * 0.18 / 1.18 * 100) / 100;
      const montoSinItbis = Math.round((montoTotal - itbis) * 100) / 100;

      // RNC_Proveedor|Tipo_ID|NCF|Fecha_Comprobante|Monto_Facturado|ITBIS_Facturado
      lineas.push([
        compra.rnc_emisor,
        compra.rnc_emisor.length === 9 ? '1' : '2', // 1=RNC, 2=Cédula
        compra.e_ncf,
        fechaDoc,
        montoSinItbis.toFixed(2),
        itbis.toFixed(2),
      ].join('|'));
    }

    return { contenido: lineas.join('\r\n'), cantidad: compras.length };
  }

  /**
   * Genera el formato 607 (Ventas de Bienes y Servicios) para un período mensual.
   * Incluye todas las facturas emitidas con estado aceptado/aprobado del mes.
   */
  async generar607(empresaId: string, anio: number, mes: number): Promise<{ contenido: string; cantidad: number }> {
    const empresa = await this.empresaRepo.findOneOrFail({ where: { id: empresaId } });
    const { desde, hasta } = this.getRangoMesTimestamp(anio, mes);

    const ventas = await this.facturaRepo.find({
      where: [
        { empresa_id: empresaId, estado_dgii: EstadoDgii.ACEPTADO, created_at: Between(desde, hasta) },
        { empresa_id: empresaId, estado_dgii: EstadoDgii.APROBADO, created_at: Between(desde, hasta) },
      ],
      order: { created_at: 'ASC' },
    });

    const periodo = `${anio}${String(mes).padStart(2, '0')}`;
    const lineas: string[] = [];

    // Header: 607|RNC|Periodo|Cantidad
    lineas.push(`607|${empresa.rnc}|${periodo}|${ventas.length}`);

    // Detail lines
    for (const venta of ventas) {
      const payload = venta.payload_json || {};
      const rncReceptor = String(payload['rnc_receptor'] || '');
      const montoTotal = Number(payload['monto_total'] || 0);
      const itbis = Number(payload['monto_itbis'] || payload['itbis_total'] || 0);
      const fechaDoc = this.formatFechaTimestamp(venta.created_at);

      // RNC_Comprador|Tipo_ID|NCF|Fecha_Comprobante|Monto_Facturado|ITBIS_Facturado
      lineas.push([
        rncReceptor,
        rncReceptor.length === 9 ? '1' : rncReceptor.length === 11 ? '2' : '3',
        venta.e_ncf || '',
        fechaDoc,
        (montoTotal - itbis).toFixed(2),
        itbis.toFixed(2),
      ].join('|'));
    }

    return { contenido: lineas.join('\r\n'), cantidad: ventas.length };
  }

  /**
   * Genera el formato 608 (Comprobantes Anulados) para un período mensual.
   * Incluye todas las facturas con estado "anulado" del mes.
   */
  async generar608(empresaId: string, anio: number, mes: number): Promise<{ contenido: string; cantidad: number }> {
    const empresa = await this.empresaRepo.findOneOrFail({ where: { id: empresaId } });
    const { desde, hasta } = this.getRangoMesTimestamp(anio, mes);

    const anuladas = await this.facturaRepo.find({
      where: {
        empresa_id: empresaId,
        estado_dgii: EstadoDgii.ANULADO,
        updated_at: Between(desde, hasta),
      },
      order: { updated_at: 'ASC' },
    });

    const periodo = `${anio}${String(mes).padStart(2, '0')}`;
    const lineas: string[] = [];

    // Header: 608|RNC|Periodo|Cantidad
    lineas.push(`608|${empresa.rnc}|${periodo}|${anuladas.length}`);

    // Detail lines
    for (const factura of anuladas) {
      const fechaAnulacion = this.formatFechaTimestamp(factura.updated_at);
      const tipoAnulacion = '02'; // 02 = Anulación de comprobante

      // NCF|Fecha_Comprobante|Tipo_Anulacion
      lineas.push([
        factura.e_ncf || '',
        fechaAnulacion,
        tipoAnulacion,
      ].join('|'));
    }

    return { contenido: lineas.join('\r\n'), cantidad: anuladas.length };
  }

  /**
   * Genera resumen de los 3 reportes para vista previa en UI.
   */
  async obtenerResumen(empresaId: string, anio: number, mes: number) {
    const [r606, r607, r608] = await Promise.all([
      this.generar606(empresaId, anio, mes),
      this.generar607(empresaId, anio, mes),
      this.generar608(empresaId, anio, mes),
    ]);

    return {
      periodo: `${anio}-${String(mes).padStart(2, '0')}`,
      formato_606: { registros: r606.cantidad },
      formato_607: { registros: r607.cantidad },
      formato_608: { registros: r608.cantidad },
    };
  }

  // ─── Helpers ───

  private getRangoMes(anio: number, mes: number): { desde: string; hasta: string } {
    const desde = `${anio}-${String(mes).padStart(2, '0')}-01`;
    const lastDay = new Date(anio, mes, 0).getDate();
    const hasta = `${anio}-${String(mes).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
    return { desde, hasta };
  }

  private getRangoMesTimestamp(anio: number, mes: number): { desde: Date; hasta: Date } {
    const desde = new Date(anio, mes - 1, 1);
    const hasta = new Date(anio, mes, 0, 23, 59, 59, 999);
    return { desde, hasta };
  }

  private formatFecha(fecha: string): string {
    // Input: "2026-01-15" → Output: "20260115"
    return fecha.replace(/-/g, '');
  }

  private formatFechaTimestamp(fecha: Date): string {
    const d = new Date(fecha);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}${m}${day}`;
  }
}
