import {
  Controller,
  Get,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
  Res,
  BadRequestException,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';

import { ReportesService } from './reportes.service.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../../common/guards/roles.guard.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import type { RequestContext } from '../../common/interfaces/request-context.interface.js';

@ApiTags('Reportes Fiscales')
@Controller('api/v1/reportes')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ReportesController {
  constructor(private readonly reportesService: ReportesService) {}

  /**
   * GET /api/v1/reportes/resumen?anio=2026&mes=7
   * Retorna un resumen de los 3 reportes para vista previa.
   */
  @Get('resumen')
  @Roles('admin', 'lector')
  @HttpCode(HttpStatus.OK)
  async resumen(
    @Query('anio') anio: string,
    @Query('mes') mes: string,
    @CurrentUser() user: RequestContext,
  ) {
    const { a, m } = this.validarPeriodo(anio, mes);
    return this.reportesService.obtenerResumen(user.empresa_id, a, m);
  }

  /**
   * GET /api/v1/reportes/606?anio=2026&mes=7
   * Descarga el formato 606 (Compras) en TXT.
   */
  @Get('606')
  @Roles('admin', 'lector')
  async descargar606(
    @Query('anio') anio: string,
    @Query('mes') mes: string,
    @CurrentUser() user: RequestContext,
    @Res() res: Response,
  ) {
    const { a, m } = this.validarPeriodo(anio, mes);
    const { contenido } = await this.reportesService.generar606(user.empresa_id, a, m);

    const filename = `606_${a}${String(m).padStart(2, '0')}.txt`;
    res.set({
      'Content-Type': 'text/plain; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    });
    res.send(contenido);
  }

  /**
   * GET /api/v1/reportes/607?anio=2026&mes=7
   * Descarga el formato 607 (Ventas) en TXT.
   */
  @Get('607')
  @Roles('admin', 'lector')
  async descargar607(
    @Query('anio') anio: string,
    @Query('mes') mes: string,
    @CurrentUser() user: RequestContext,
    @Res() res: Response,
  ) {
    const { a, m } = this.validarPeriodo(anio, mes);
    const { contenido } = await this.reportesService.generar607(user.empresa_id, a, m);

    const filename = `607_${a}${String(m).padStart(2, '0')}.txt`;
    res.set({
      'Content-Type': 'text/plain; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    });
    res.send(contenido);
  }

  /**
   * GET /api/v1/reportes/608?anio=2026&mes=7
   * Descarga el formato 608 (Anulados) en TXT.
   */
  @Get('608')
  @Roles('admin', 'lector')
  async descargar608(
    @Query('anio') anio: string,
    @Query('mes') mes: string,
    @CurrentUser() user: RequestContext,
    @Res() res: Response,
  ) {
    const { a, m } = this.validarPeriodo(anio, mes);
    const { contenido } = await this.reportesService.generar608(user.empresa_id, a, m);

    const filename = `608_${a}${String(m).padStart(2, '0')}.txt`;
    res.set({
      'Content-Type': 'text/plain; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    });
    res.send(contenido);
  }

  private validarPeriodo(anio: string, mes: string): { a: number; m: number } {
    const a = parseInt(anio, 10);
    const m = parseInt(mes, 10);

    if (isNaN(a) || a < 2020 || a > 2099) {
      throw new BadRequestException('anio debe ser un número entre 2020 y 2099');
    }
    if (isNaN(m) || m < 1 || m > 12) {
      throw new BadRequestException('mes debe ser un número entre 1 y 12');
    }

    return { a, m };
  }
}
