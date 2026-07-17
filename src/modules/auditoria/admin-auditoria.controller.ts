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
import { SuperAdminGuard } from '../../common/guards/super-admin.guard.js';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe.js';
import {
  ListAuditoriaGlobalQuerySchema,
  type ListAuditoriaGlobalQueryDto,
} from './dto/auditoria.schemas.js';

/**
 * Controller para consulta de auditoría cross-empresa.
 * Solo accesible por Super_Admin.
 * Req 31.4
 */
@Controller('api/v1/admin/auditoria')
@UseGuards(JwtAuthGuard, SuperAdminGuard)
export class AdminAuditoriaController {
  constructor(private readonly auditoriaService: AuditoriaService) {}

  /**
   * GET /api/v1/admin/auditoria
   * Lista registros de auditoría de todas las empresas.
   * Solo Super_Admin.
   * Req 31.4
   */
  @Get()
  @HttpCode(HttpStatus.OK)
  async listarGlobal(
    @Query(new ZodValidationPipe(ListAuditoriaGlobalQuerySchema))
    query: ListAuditoriaGlobalQueryDto,
  ) {
    return this.auditoriaService.listarGlobal(query);
  }
}
