import { ApiTags } from '@nestjs/swagger';
import {
  Controller,
  Post,
  Get,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';

import { CatalogoService } from './catalogo.service.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../../common/guards/roles.guard.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe.js';
import type { RequestContext } from '../../common/interfaces/request-context.interface.js';
import {
  CreateCatalogoItemSchema,
  UpdateCatalogoItemSchema,
  ListCatalogoQuerySchema,
  type CreateCatalogoItemDto,
  type UpdateCatalogoItemDto,
  type ListCatalogoQueryDto,
} from './dto/catalogo.schemas.js';

@ApiTags('Catálogo')
@Controller('api/v1/catalogo')
@UseGuards(JwtAuthGuard, RolesGuard)
export class CatalogoController {
  constructor(private readonly catalogoService: CatalogoService) {}

  /**
   * POST /api/v1/catalogo
   * Crear un ítem del catálogo (admin o facturador).
   * Req 25.1, 25.5
   */
  @Post()
  @Roles('admin', 'facturador')
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Body(new ZodValidationPipe(CreateCatalogoItemSchema)) dto: CreateCatalogoItemDto,
    @CurrentUser() user: RequestContext,
  ) {
    const item = await this.catalogoService.create(user.empresa_id, dto);
    return item;
  }

  /**
   * GET /api/v1/catalogo
   * Listar ítems del catálogo con filtros.
   * Req 25.2, 25.5, 25.6, 25.9
   */
  @Get()
  @Roles('admin', 'facturador', 'lector')
  @HttpCode(HttpStatus.OK)
  async list(
    @Query(new ZodValidationPipe(ListCatalogoQuerySchema)) query: ListCatalogoQueryDto,
    @CurrentUser() user: RequestContext,
  ) {
    return this.catalogoService.list(user.empresa_id, {
      tipo: query.tipo,
      activo: query.activo,
      search: query.search,
    });
  }

  /**
   * PATCH /api/v1/catalogo/:id
   * Actualizar campos del ítem.
   * Req 25.3, 25.5
   */
  @Patch(':id')
  @Roles('admin', 'facturador')
  @HttpCode(HttpStatus.OK)
  async update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(UpdateCatalogoItemSchema)) dto: UpdateCatalogoItemDto,
    @CurrentUser() user: RequestContext,
  ) {
    return this.catalogoService.update(id, user.empresa_id, dto);
  }

  /**
   * DELETE /api/v1/catalogo/:id
   * Borrado lógico (activo=false).
   * Req 25.4, 25.5
   */
  @Delete(':id')
  @Roles('admin', 'facturador')
  @HttpCode(HttpStatus.OK)
  async remove(@Param('id') id: string, @CurrentUser() user: RequestContext) {
    await this.catalogoService.softDelete(id, user.empresa_id);
    return { mensaje: 'Ítem de catálogo desactivado exitosamente' };
  }
}
