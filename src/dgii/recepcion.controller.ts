import {
  Controller,
  Post,
  Body,
  HttpCode,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { XMLParser } from 'fast-xml-parser';
import {
  FacturaRecibida,
  EstadoAprobacion,
} from '../database/entities/factura-recibida.entity.js';
import { Empresa } from '../database/entities/empresa.entity.js';

/**
 * Endpoint público de recepción de e-CF desde la DGII.
 * La DGII envía XML cuando otros emisores transmiten facturas
 * dirigidas a esta empresa.
 *
 * No requiere autenticación - la DGII lo invoca directamente.
 * @see Gap 7: Recepción endpoint for DGII webhook
 */
@Controller('api/v1/dgii/recepcion')
export class RecepcionController {
  private readonly logger = new Logger(RecepcionController.name);
  private readonly xmlParser: XMLParser;

  constructor(
    @InjectRepository(FacturaRecibida)
    private readonly facturaRecibidaRepo: Repository<FacturaRecibida>,
    @InjectRepository(Empresa)
    private readonly empresaRepo: Repository<Empresa>,
  ) {
    this.xmlParser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: '@_',
      parseTagValue: true,
      trimValues: true,
    });
  }

  /**
   * POST /api/v1/dgii/recepcion
   * Recibe XML de la DGII con e-CF emitidos por otros contribuyentes
   * dirigidos a esta empresa.
   */
  @Post()
  @HttpCode(HttpStatus.OK)
  async recibirEcf(
    @Body() body: string,
  ): Promise<{ message: string; recibido: boolean }> {
    try {
      const xmlContent = typeof body === 'string' ? body : JSON.stringify(body);

      // Parsear el XML para extraer información básica
      const parsed = this.xmlParser.parse(xmlContent);
      const ecf = parsed?.ECF || parsed?.ecf || parsed;

      const encabezado = ecf?.Encabezado || {};
      const emisor = encabezado?.Emisor || {};
      const totales = encabezado?.Totales || {};
      const idDoc = encabezado?.IdDoc || {};

      const rncEmisor = String(emisor?.RNCEmisor || emisor?.RNCemisor || '');
      const razonSocialEmisor = String(emisor?.RazonSocialEmisor || '');
      const eNcf = String(idDoc?.eNCF || '');
      const montoTotal = Number(totales?.MontoTotal || 0);
      const fechaEmision = String(emisor?.FechaEmision || new Date().toISOString().split('T')[0]);

      // Identificar la empresa receptora por RNC del Comprador
      const comprador = encabezado?.Comprador || {};
      const rncComprador = String(comprador?.RNCComprador || '');

      let empresaId: string | null = null;
      if (rncComprador) {
        const empresa = await this.empresaRepo.findOne({ where: { rnc: rncComprador } });
        if (empresa) {
          empresaId = empresa.id;
        }
      }

      if (!empresaId) {
        this.logger.warn(`Recepción DGII: No se encontró empresa para RNC ${rncComprador}`);
        return { message: 'Recibido pero empresa no identificada', recibido: true };
      }

      // Crear registro en facturas_recibidas
      const facturaRecibida = this.facturaRecibidaRepo.create({
        empresa_id: empresaId,
        rnc_emisor: rncEmisor || '000000000',
        nombre_emisor: razonSocialEmisor || 'Emisor Desconocido',
        e_ncf: eNcf || 'N/A',
        fecha_emision: fechaEmision,
        monto_total: montoTotal || 0,
        estado_aprobacion: EstadoAprobacion.PENDIENTE,
      });

      await this.facturaRecibidaRepo.save(facturaRecibida);

      this.logger.log(
        `e-CF recibido: eNCF=${eNcf}, RNC emisor=${rncEmisor}, monto=${montoTotal}`,
      );

      return { message: 'e-CF recibido exitosamente', recibido: true };
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Error desconocido';
      this.logger.error(`Error procesando e-CF recibido: ${msg}`);
      // Retornar 200 de todas formas para que la DGII no reintente
      return { message: 'Error procesando XML pero recibido', recibido: true };
    }
  }
}
