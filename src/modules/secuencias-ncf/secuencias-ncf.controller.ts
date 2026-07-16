import {
  Controller,
  Post,
  Get,
  Patch,
  Body,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';

import { SecuenciasNcfService } from './secuencias-ncf.service.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../../common/guards/roles.guard.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe.js';
import type { RequestContext } from '../../common/interfaces/request-context.interface.js';
import {
  CreateSecuenciaNcfSchema,
  UpdateSecuenciaNcfSchema,
  type CreateSecuenciaNcfDto,
  type UpdateSecuenciaNcfDto,
} from './dto/secuencias-ncf.schemas.js';

@Controller('api/v1/secuencias-ncf')
@UseGuards(JwtAuthGuard, RolesGuard)
export class SecuenciasNcfController {
  constructor(private readonly secuenciasNcfService: SecuenciasNcfService) {}

  /**
   * POST /api/v1/secuencias-ncf
   * Crear una secuencia NCF (solo admin).
   * Req 28.2, 28.12
   */
  @Post()
  @Roles('admin')
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Body(new ZodValidationPipe(CreateSecuenciaNcfSchema)) dto: CreateSecuenciaNcfDto,
    @CurrentUser() user: RequestContext,
  ) {
    return this.secuenciasNcfService.create(user.empresa_id, dto);
  }

  /**
   * GET /api/v1/secuencias-ncf
   * Listar secuencias NCF de la empresa (solo admin).
   * Req 28.3, 28.12
   */
  @Get()
  @Roles('admin')
  @HttpCode(HttpStatus.OK)
  async list(@CurrentUser() user: RequestContext) {
    return this.secuenciasNcfService.list(user.empresa_id);
  }

  /**
   * GET /api/v1/secuencias-ncf/estado
   * Resumen de capacidad restante (admin o facturador).
   * Req 28.13
   */
  @Get('estado')
  @Roles('admin', 'facturador')
  @HttpCode(HttpStatus.OK)
  async getEstado(@CurrentUser() user: RequestContext) {
    return this.secuenciasNcfService.getEstado(user.empresa_id);
  }

  /**
   * PATCH /api/v1/secuencias-ncf/:id
   * Desactivar una secuencia NCF (solo admin).
   * Req 28.4, 28.12
   */
  @Patch(':id')
  @Roles('admin')
  @HttpCode(HttpStatus.OK)
  async deactivate(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(UpdateSecuenciaNcfSchema)) _dto: UpdateSecuenciaNcfDto,
    @CurrentUser() user: RequestContext,
  ) {
    return this.secuenciasNcfService.deactivate(id, user.empresa_id);
  }
}
