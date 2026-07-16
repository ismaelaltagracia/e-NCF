import {
  Controller,
  Get,
  Patch,
  Param,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
  ParseUUIDPipe,
} from '@nestjs/common';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { SuperAdminGuard } from '../../common/guards/super-admin.guard.js';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe.js';
import { PlanesService } from '../planes/planes.service.js';
import { CambiarPlanSchema, type CambiarPlanDto } from './dto/admin.schemas.js';

@Controller('api/v1/admin')
@UseGuards(JwtAuthGuard, SuperAdminGuard)
export class AdminController {
  constructor(private readonly planesService: PlanesService) {}

  /**
   * GET /api/v1/admin/planes
   * Lista todos los planes disponibles. Solo Super_Admin.
   * Req 27.7
   */
  @Get('planes')
  @HttpCode(HttpStatus.OK)
  async getPlanes() {
    return this.planesService.findAll();
  }

  /**
   * PATCH /api/v1/admin/empresas/:id/plan
   * Cambia el plan de una empresa. Solo Super_Admin.
   * Req 27.6
   */
  @Patch('empresas/:id/plan')
  @HttpCode(HttpStatus.OK)
  async cambiarPlan(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(CambiarPlanSchema)) dto: CambiarPlanDto,
  ) {
    const empresa = await this.planesService.cambiarPlan(id, dto.plan_id);
    return {
      message: 'Plan actualizado exitosamente',
      empresa_id: empresa.id,
      plan_id: empresa.plan_id,
    };
  }
}
