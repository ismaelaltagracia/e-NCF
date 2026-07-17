import {
  Controller,
  Get,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';

import { RncValidatorService } from './rnc-validator.service.js';
import { JwtAuthGuard } from '../modules/auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../common/guards/roles.guard.js';
import { Roles } from '../common/decorators/roles.decorator.js';

/**
 * Controlador para consulta manual de validación de RNC contra la DGII.
 *
 * @see Requisito 33.5
 */
@Controller('api/v1/rnc')
@UseGuards(JwtAuthGuard, RolesGuard)
export class RncValidatorController {
  constructor(private readonly rncValidatorService: RncValidatorService) {}

  /**
   * GET /api/v1/rnc/:rnc/validar
   * Consulta manual de la validez de un RNC contra el registro de la DGII.
   *
   * Retorna: rnc, nombre_contribuyente, estado, tipo_contribuyente
   *
   * @see Requisito 33.5
   */
  @Get(':rnc/validar')
  @Roles('admin', 'facturador', 'lector')
  @HttpCode(HttpStatus.OK)
  async validarRnc(@Param('rnc') rnc: string) {
    const result = await this.rncValidatorService.validarRnc(rnc);
    return result;
  }
}
