import { ApiTags } from '@nestjs/swagger';
import {
  Controller,
  Post,
  Get,
  Delete,
  Param,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';

import { WebhooksService } from './webhooks.service.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../../common/guards/roles.guard.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe.js';
import type { RequestContext } from '../../common/interfaces/request-context.interface.js';
import { CreateWebhookSchema, type CreateWebhookDto } from './dto/webhooks.schemas.js';

/**
 * Controller para gestión de webhooks por empresa.
 * Req 32.1, 32.2, 32.3, 32.4
 */
@ApiTags('Webhooks')
@Controller('api/v1/webhooks')
@UseGuards(JwtAuthGuard, RolesGuard)
export class WebhooksController {
  constructor(private readonly webhooksService: WebhooksService) {}

  /**
   * POST /api/v1/webhooks
   * Configurar un nuevo webhook.
   * Req 32.1
   */
  @Post()
  @Roles('admin')
  @HttpCode(HttpStatus.CREATED)
  async crear(
    @Body(new ZodValidationPipe(CreateWebhookSchema)) dto: CreateWebhookDto,
    @CurrentUser() user: RequestContext,
  ) {
    const webhook = await this.webhooksService.crear(user.empresa_id, dto);
    // No exponer el secret en la respuesta
    const { secret: _secret, ...result } = webhook;
    return result;
  }

  /**
   * GET /api/v1/webhooks
   * Listar webhooks de la empresa.
   * Req 32.2
   */
  @Get()
  @Roles('admin')
  @HttpCode(HttpStatus.OK)
  async listar(@CurrentUser() user: RequestContext) {
    return this.webhooksService.listar(user.empresa_id);
  }

  /**
   * DELETE /api/v1/webhooks/:id
   * Desactivar un webhook.
   * Req 32.3
   */
  @Delete(':id')
  @Roles('admin')
  @HttpCode(HttpStatus.NO_CONTENT)
  async desactivar(
    @Param('id') id: string,
    @CurrentUser() user: RequestContext,
  ) {
    await this.webhooksService.desactivar(id, user.empresa_id);
  }

  /**
   * POST /api/v1/webhooks/:id/test
   * Enviar un evento de prueba al webhook.
   * Req 32.4
   */
  @Post(':id/test')
  @Roles('admin')
  @HttpCode(HttpStatus.OK)
  async probar(
    @Param('id') id: string,
    @CurrentUser() user: RequestContext,
  ) {
    return this.webhooksService.probar(id, user.empresa_id);
  }
}
