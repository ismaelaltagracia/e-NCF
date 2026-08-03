import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

import { DispositivosService } from './dispositivos.service.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../../common/guards/roles.guard.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import type { RequestContext } from '../../common/interfaces/request-context.interface.js';

@ApiTags('Dispositivos')
@Controller('api/v1/dispositivos')
@UseGuards(JwtAuthGuard, RolesGuard)
export class DispositivosController {
  constructor(private readonly service: DispositivosService) {}

  /**
   * POST /api/v1/dispositivos/registrar
   * Registra un dispositivo Print Bridge.
   * Valida límite del plan antes de aceptar.
   */
  @Post('registrar')
  @Roles('admin', 'facturador')
  @HttpCode(HttpStatus.OK)
  async registrar(
    @Body() body: { machine_id: string; nombre_equipo: string },
    @CurrentUser() user: RequestContext,
  ) {
    return this.service.registrar(
      user.empresa_id,
      body.machine_id,
      body.nombre_equipo,
    );
  }

  /**
   * POST /api/v1/dispositivos/:id/heartbeat
   * El Print Bridge envía esto periódicamente para indicar que sigue activo.
   */
  @Post(':id/heartbeat')
  @Roles('admin', 'facturador')
  @HttpCode(HttpStatus.NO_CONTENT)
  async heartbeat(
    @Param('id') id: string,
    @CurrentUser() user: RequestContext,
  ) {
    await this.service.heartbeat(id, user.empresa_id);
  }

  /**
   * GET /api/v1/dispositivos
   * Lista todos los dispositivos registrados de la empresa.
   */
  @Get()
  @Roles('admin')
  @HttpCode(HttpStatus.OK)
  async listar(@CurrentUser() user: RequestContext) {
    return this.service.listar(user.empresa_id);
  }

  /**
   * DELETE /api/v1/dispositivos/:id
   * Desactiva un dispositivo (libera un slot del plan).
   */
  @Delete(':id')
  @Roles('admin')
  @HttpCode(HttpStatus.OK)
  async desactivar(
    @Param('id') id: string,
    @CurrentUser() user: RequestContext,
  ) {
    return this.service.desactivar(id, user.empresa_id);
  }
}
