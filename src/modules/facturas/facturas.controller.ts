import { ApiTags } from '@nestjs/swagger';
import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
  Req,
  ConflictException,
  UnprocessableEntityException,
} from '@nestjs/common';
import type { Request } from 'express';

import { FacturasService } from './facturas.service.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../../common/guards/roles.guard.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe.js';
import { CreateFacturaSchema, type CreateFacturaDto } from './dto/factura.schemas.js';
import {
  ListFacturasQuerySchema,
  type ListFacturasQueryDto,
} from './dto/list-facturas-query.schema.js';
import { AnulacionSchema, type AnulacionDto } from './dto/anulacion.schema.js';
import type { RequestContext } from '../../common/interfaces/request-context.interface.js';
import { getCorrelationId } from '../../common/interceptors/correlation-id.interceptor.js';
import { AnulacionService } from '../../dgii/anulacion.service.js';
import { AuditoriaService } from '../auditoria/auditoria.service.js';
import { DeviceValidationGuard } from '../../common/guards/device-validation.guard.js';
import { EstadoDgii } from '../../database/enums.js';

@ApiTags('Facturas')
@Controller('api/v1/facturas')
@UseGuards(JwtAuthGuard, RolesGuard, DeviceValidationGuard)
export class FacturasController {
  constructor(
    private readonly facturasService: FacturasService,
    private readonly anulacionService: AnulacionService,
    private readonly auditoriaService: AuditoriaService,
  ) {}

  /**
   * POST /api/v1/facturas
   * Crear y transmitir una factura electrónica (e-CF) a la DGII.
   * Roles: admin, facturador
   *
   * @see Requirements 8.6, 13.1, 13.2, 13.3, 13.4, 13.5, 13.6, 18.2, 18.3, 18.4
   */
  @Post()
  @Roles('admin', 'facturador')
  @HttpCode(HttpStatus.CREATED)
  async crear(
    @Body(new ZodValidationPipe(CreateFacturaSchema)) dto: CreateFacturaDto,
    @CurrentUser() user: RequestContext,
    @Req() req: Request,
  ) {
    const correlationId =
      getCorrelationId() ??
      (req as Request & { correlationId?: string }).correlationId ??
      'no-correlation';

    return this.facturasService.crearFactura(dto, user, correlationId);
  }

  /**
   * POST /api/v1/facturas/:id/anular
   * Anular una factura electrónica previamente aprobada por la DGII.
   * Solo admin. Solo facturas con estado_dgii = "aprobado".
   * El e-NCF NO se libera (consumido permanentemente por regulaciones DGII).
   *
   * @see Requirements 30.1, 30.2, 30.3, 30.4, 30.5, 30.6, 30.7
   */
  @Post(':id/anular')
  @Roles('admin')
  @HttpCode(HttpStatus.OK)
  async anular(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(AnulacionSchema)) dto: AnulacionDto,
    @CurrentUser() user: RequestContext,
    @Req() req: Request,
  ) {
    const correlationId =
      getCorrelationId() ??
      (req as Request & { correlationId?: string }).correlationId ??
      'no-correlation';

    // Validate factura exists and belongs to the user's empresa
    const factura = await this.facturasService.obtenerFactura(id, user.empresa_id);

    // Req 30.6: Only approved invoices can be annulled
    if (factura.estado_dgii !== EstadoDgii.APROBADO) {
      throw new ConflictException(
        `Solo se pueden anular facturas con estado "aprobado". Estado actual: "${factura.estado_dgii}"`,
      );
    }

    // Req 30.2: Generate XML, sign, transmit to DGII
    const resultado = await this.anulacionService.anular({
      factura_id: factura.id,
      empresa_id: user.empresa_id,
      e_ncf: factura.e_ncf ?? '',
      rnc_emisor: user.rnc,
      motivo: dto.motivo,
      correlation_id: correlationId,
      ambiente: factura.ambiente,
    });

    // Req 30.4: If DGII rejects, return 422 without modifying the record
    if (!resultado.exito) {
      throw new UnprocessableEntityException({
        statusCode: 422,
        message: 'La DGII rechazó la solicitud de anulación',
        error_dgii: resultado.error_dgii,
      });
    }

    // Req 30.3: Update estado_dgii to ANULADO
    await this.facturasService.actualizarEstadoAnulado(factura.id);

    // Req 30.3: Create audit log entry
    await this.auditoriaService.registrar({
      empresa_id: user.empresa_id,
      usuario_id: user.tipo === 'usuario' ? (user.usuario_id ?? null) : null,
      api_key_id: user.tipo === 'api_key' ? (user.api_key_id ?? null) : null,
      accion: 'factura_anulada',
      recurso_tipo: 'factura_electronica',
      recurso_id: factura.id,
      datos_anteriores: { estado_dgii: EstadoDgii.APROBADO },
      datos_nuevos: { estado_dgii: EstadoDgii.ANULADO, motivo: dto.motivo },
      ip_origen: req.ip ?? null,
      correlation_id: correlationId,
    });

    // Req 30.7: e-NCF is NOT released (consumed permanently)
    return {
      id: factura.id,
      e_ncf: factura.e_ncf,
      estado_dgii: EstadoDgii.ANULADO,
      mensaje: 'Factura anulada exitosamente',
    };
  }

  /**
   * GET /api/v1/facturas
   * Listar facturas de la empresa autenticada con paginación.
   * Roles: admin, facturador, lector
   *
   * @see Requirements 18.5, 18.7
   */
  @Get()
  @Roles('admin', 'facturador', 'lector')
  @HttpCode(HttpStatus.OK)
  async listar(
    @Query(new ZodValidationPipe(ListFacturasQuerySchema)) query: ListFacturasQueryDto,
    @CurrentUser() user: RequestContext,
  ) {
    return this.facturasService.listarFacturas(user.empresa_id, {
      page: query.page,
      limit: query.limit,
      estado_dgii: query.estado_dgii,
      tipo_comprobante: query.tipo_comprobante,
      fecha_desde: query.fecha_desde,
      fecha_hasta: query.fecha_hasta,
      rnc_receptor: query.rnc_receptor,
      e_ncf: query.e_ncf,
      ambiente: query.ambiente,
    });
  }

  /**
   * GET /api/v1/facturas/:id/estado
   * Obtener estado actual DGII de una factura con aislamiento multi-tenencia.
   * Roles: admin, facturador, lector
   *
   * @see Requirements 29.3
   */
  @Get(':id/estado')
  @Roles('admin', 'facturador', 'lector')
  @HttpCode(HttpStatus.OK)
  async estado(
    @Param('id') id: string,
    @CurrentUser() user: RequestContext,
  ) {
    return this.facturasService.obtenerEstadoFactura(id, user.empresa_id);
  }

  /**
   * GET /api/v1/facturas/:id/pdf
   * Generar URL pre-firmada para descarga del PDF de una factura (TTL 15 min).
   * Roles: admin, facturador, lector
   *
   * @see Requirements 16.1, 16.2, 16.3, 16.4, 16.5
   */
  @Get(':id/pdf')
  @Roles('admin', 'facturador', 'lector')
  @HttpCode(HttpStatus.OK)
  async descargarPdf(
    @Param('id') id: string,
    @CurrentUser() user: RequestContext,
  ) {
    return this.facturasService.descargarPdf(id, user.empresa_id);
  }

  /**
   * POST /api/v1/facturas/:id/enviar-email
   * Envía la factura por correo electrónico con PDF adjunto y código QR.
   * Roles: admin, facturador
   */
  @Post(':id/enviar-email')
  @Roles('admin', 'facturador')
  @HttpCode(HttpStatus.OK)
  async enviarEmail(
    @Param('id') id: string,
    @Body() body: { email: string },
    @CurrentUser() user: RequestContext,
  ) {
    return this.facturasService.enviarFacturaEmail(id, user.empresa_id, body.email);
  }

  /**
   * GET /api/v1/facturas/:id
   * Obtener detalle de una factura con aislamiento multi-tenencia.
   * Roles: admin, facturador, lector
   *
   * @see Requirements 18.2, 29.3
   */
  @Get(':id')
  @Roles('admin', 'facturador', 'lector')
  @HttpCode(HttpStatus.OK)
  async detalle(
    @Param('id') id: string,
    @CurrentUser() user: RequestContext,
  ) {
    return this.facturasService.obtenerFactura(id, user.empresa_id);
  }
}
