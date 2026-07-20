import { ApiTags } from '@nestjs/swagger';
import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';

import { FacturasRecibidasService } from './facturas-recibidas.service.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../../common/guards/roles.guard.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe.js';
import {
  CreateFacturaRecibidaSchema,
  RechazarFacturaRecibidaSchema,
  type CreateFacturaRecibidaDto,
  type RechazarFacturaRecibidaDto,
} from './dto/factura-recibida.schemas.js';
import type { RequestContext } from '../../common/interfaces/request-context.interface.js';

@ApiTags('Facturas Recibidas')
@Controller('api/v1/facturas-recibidas')
@UseGuards(JwtAuthGuard, RolesGuard)
export class FacturasRecibidasController {
  constructor(private readonly service: FacturasRecibidasService) {}

  @Get()
  @Roles('admin', 'facturador', 'lector')
  @HttpCode(HttpStatus.OK)
  async listar(@CurrentUser() user: RequestContext) {
    return this.service.listar(user.empresa_id);
  }

  @Post()
  @Roles('admin', 'facturador')
  @HttpCode(HttpStatus.CREATED)
  async registrar(
    @Body(new ZodValidationPipe(CreateFacturaRecibidaSchema)) dto: CreateFacturaRecibidaDto,
    @CurrentUser() user: RequestContext,
  ) {
    return this.service.registrar(dto, user.empresa_id);
  }

  @Post(':id/aprobar')
  @Roles('admin', 'facturador')
  @HttpCode(HttpStatus.OK)
  async aprobar(
    @Param('id') id: string,
    @CurrentUser() user: RequestContext,
  ) {
    return this.service.aprobar(id, user.empresa_id);
  }

  @Post(':id/rechazar')
  @Roles('admin', 'facturador')
  @HttpCode(HttpStatus.OK)
  async rechazar(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(RechazarFacturaRecibidaSchema)) dto: RechazarFacturaRecibidaDto,
    @CurrentUser() user: RequestContext,
  ) {
    return this.service.rechazar(id, user.empresa_id, dto.motivo);
  }
}
