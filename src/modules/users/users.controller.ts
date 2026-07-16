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
  Headers,
} from '@nestjs/common';

import { UsersService } from './users.service.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../../common/guards/roles.guard.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe.js';
import type { RequestContext } from '../../common/interfaces/request-context.interface.js';
import {
  CreateUsuarioSchema,
  UpdateUsuarioSchema,
  type CreateUsuarioDto,
  type UpdateUsuarioDto,
} from './dto/users.schemas.js';

@Controller('api/v1/usuarios')
@UseGuards(JwtAuthGuard, RolesGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  /**
   * POST /api/v1/usuarios
   * Crear un nuevo usuario (solo admin). Req 3.1, 3.2
   */
  @Post()
  @Roles('admin')
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Body(new ZodValidationPipe(CreateUsuarioSchema)) dto: CreateUsuarioDto,
    @CurrentUser() user: RequestContext,
  ) {
    return this.usersService.create(dto, user.empresa_id);
  }

  /**
   * GET /api/v1/usuarios
   * Listar usuarios de la empresa (solo admin). Req 3.5
   */
  @Get()
  @Roles('admin')
  @HttpCode(HttpStatus.OK)
  async findAll(@CurrentUser() user: RequestContext) {
    return this.usersService.findAllByEmpresa(user.empresa_id);
  }

  /**
   * PATCH /api/v1/usuarios/:id
   * Actualizar rol o desactivar usuario (solo admin). Req 3.3, 3.6
   */
  @Patch(':id')
  @Roles('admin')
  @HttpCode(HttpStatus.OK)
  async update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(UpdateUsuarioSchema)) dto: UpdateUsuarioDto,
    @CurrentUser() user: RequestContext,
    @Headers('x-correlation-id') correlationId?: string,
  ) {
    return this.usersService.update(id, dto, user.empresa_id, correlationId);
  }
}
