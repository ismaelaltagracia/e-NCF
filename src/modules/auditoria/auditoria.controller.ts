import { ApiTags } from '@nestjs/swagger';
import {
  Controller,
  Get,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';

import { AuditoriaService } from './auditoria.service.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../../common/guards/roles.guard.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe.js';
import type { RequestContext } from '../../common/interfaces/request-context.interface.js';
import {
  ListAuditoriaQuerySchema,
  type ListAuditoriaQueryDto,
} from './dto/auditoria.schemas.js';

/**
 * Controller para consulta de registros de auditoría por empresa.
 * No expone POST/PATCH/DELETE - los registros se crean solo internamente.
 * Req 31.3, 31.5
 */
@ApiTags('Auditoría')
@Controller('api/v1/auditoria')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AuditoriaController {
  constructor(private readonly auditoriaService: AuditoriaService) {}

  /**
   * GET /api/v1/auditoria
   * Lista registros de auditoría de la empresa autenticada.
   * Solo accesible por rol admin.
   * Req 31.3
   */
  @Get()
  @Roles('admin')
  @HttpCode(HttpStatus.OK)
  async listar(
    @Query(new ZodValidationPipe(ListAuditoriaQuerySchema)) query: ListAuditoriaQueryDto,
    @CurrentUser() user: RequestContext,
  ) {
    return this.auditoriaService.listar(user.empresa_id, query);
  }
}
