import { ApiTags } from '@nestjs/swagger';
import {
  Controller,
  Post,
  Get,
  Delete,
  Body,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
  Headers,
} from '@nestjs/common';

import { ApiKeysService } from './api-keys.service.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../../common/guards/roles.guard.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe.js';
import type { RequestContext } from '../../common/interfaces/request-context.interface.js';
import { CreateApiKeySchema, type CreateApiKeyDto } from './dto/api-keys.schemas.js';

@ApiTags('API Keys')
@Controller('api/v1/api-keys')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ApiKeysController {
  constructor(private readonly apiKeysService: ApiKeysService) {}

  /**
   * POST /api/v1/api-keys
   * Crear un nuevo API Key (solo admin). Req 4.1
   */
  @Post()
  @Roles('admin')
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Body(new ZodValidationPipe(CreateApiKeySchema)) dto: CreateApiKeyDto,
    @CurrentUser() user: RequestContext,
  ) {
    const result = await this.apiKeysService.create(user.empresa_id, dto.nombre, dto.scopes, user.usuario_id);
    return {
      id: result.id,
      key: result.key,
      mensaje: 'API Key creada exitosamente. Guarde la key, no se mostrará nuevamente.',
    };
  }

  /**
   * GET /api/v1/api-keys
   * Listar API Keys de la empresa (solo admin). Req 4.2
   */
  @Get()
  @Roles('admin')
  @HttpCode(HttpStatus.OK)
  async findAll(@CurrentUser() user: RequestContext) {
    return this.apiKeysService.listByEmpresa(user.empresa_id);
  }

  /**
   * POST /api/v1/api-keys/:id/rotate
   * Rotar un API Key (solo admin). Req 4.3
   */
  @Post(':id/rotate')
  @Roles('admin')
  @HttpCode(HttpStatus.OK)
  async rotate(
    @Param('id') id: string,
    @CurrentUser() user: RequestContext,
    @Headers('x-correlation-id') correlationId?: string,
  ) {
    const result = await this.apiKeysService.rotate(id, user.empresa_id, correlationId);
    return {
      id: result.id,
      key: result.key,
      mensaje: 'API Key rotada exitosamente. Guarde la nueva key, no se mostrará nuevamente.',
    };
  }

  /**
   * DELETE /api/v1/api-keys/:id
   * Revocar un API Key (solo admin). Req 4.4
   */
  @Delete(':id')
  @Roles('admin')
  @HttpCode(HttpStatus.OK)
  async revoke(
    @Param('id') id: string,
    @CurrentUser() user: RequestContext,
    @Headers('x-correlation-id') correlationId?: string,
  ) {
    await this.apiKeysService.revoke(id, user.empresa_id, correlationId);
    return { mensaje: 'API Key revocada exitosamente' };
  }

  /**
   * GET /api/v1/api-keys/:id/reveal
   * Revelar la key descifrada (solo admin). Req 4.5
   */
  @Get(':id/reveal')
  @Roles('admin')
  @HttpCode(HttpStatus.OK)
  async revealKey(
    @Param('id') id: string,
    @CurrentUser() user: RequestContext,
  ) {
    return this.apiKeysService.revealKey(id, user.empresa_id);
  }
}
