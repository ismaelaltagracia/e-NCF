import { ApiTags } from '@nestjs/swagger';
import {
  Controller,
  Post,
  Get,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';

import { CertificacionService } from './certificacion.service.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../../common/guards/roles.guard.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import type { RequestContext } from '../../common/interfaces/request-context.interface.js';

@ApiTags('Certificación')
@Controller('api/v1/certificacion')
@UseGuards(JwtAuthGuard, RolesGuard)
export class CertificacionController {
  constructor(private readonly certificacionService: CertificacionService) {}

  /**
   * GET /api/v1/certificacion/validar
   * Valida que existan las secuencias NCF necesarias para ejecutar las 15 pruebas.
   */
  @Get('validar')
  @Roles('admin', 'facturador')
  @HttpCode(HttpStatus.OK)
  async validar(@CurrentUser() user: RequestContext) {
    return this.certificacionService.validarRequisitos(user.empresa_id);
  }

  /**
   * POST /api/v1/certificacion/preparar
   * Crea automáticamente las secuencias NCF faltantes para poder ejecutar las pruebas.
   */
  @Post('preparar')
  @Roles('admin')
  @HttpCode(HttpStatus.OK)
  async preparar(@CurrentUser() user: RequestContext) {
    return this.certificacionService.crearSecuenciasFaltantes(user.empresa_id);
  }

  /**
   * POST /api/v1/certificacion/ejecutar
   * Ejecuta los 15 pasos del set de pruebas de certificación DGII.
   * Solo admin puede ejecutar el set de pruebas.
   */
  @Post('ejecutar')
  @Roles('admin')
  @HttpCode(HttpStatus.OK)
  async ejecutar(@CurrentUser() user: RequestContext) {
    return this.certificacionService.ejecutarSetDePruebas(user);
  }

  /**
   * GET /api/v1/certificacion/estado
   * Obtiene el resultado de la última ejecución del set de pruebas.
   * Admin y facturador pueden consultar el estado.
   */
  @Get('estado')
  @Roles('admin', 'facturador')
  @HttpCode(HttpStatus.OK)
  async estado() {
    const ultima = this.certificacionService.getUltimaEjecucion();
    if (!ultima) {
      return {
        ejecutado: false,
        mensaje: 'No se ha ejecutado el set de pruebas aún',
      };
    }
    return { ejecutado: true, ...ultima };
  }

  /**
   * GET /api/v1/certificacion/progreso-integrador
   * Consulta el progreso de certificación basado en facturas reales enviadas via API.
   * Determina cuáles de los 15 pasos ya se han completado.
   */
  @Get('progreso-integrador')
  @Roles('admin', 'facturador')
  @HttpCode(HttpStatus.OK)
  async progresoIntegrador(@CurrentUser() user: RequestContext) {
    return this.certificacionService.getProgresoIntegrador(user.empresa_id);
  }
}
