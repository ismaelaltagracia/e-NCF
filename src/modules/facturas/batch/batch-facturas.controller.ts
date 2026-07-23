import {
  Controller,
  Post,
  Get,
  UseGuards,
  HttpCode,
  HttpStatus,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
  Req,
  Res,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';

import { BatchFacturasService } from './batch-facturas.service.js';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../../../common/guards/roles.guard.js';
import { Roles } from '../../../common/decorators/roles.decorator.js';
import { CurrentUser } from '../../../common/decorators/current-user.decorator.js';
import { getCorrelationId } from '../../../common/interceptors/correlation-id.interceptor.js';
import type { RequestContext } from '../../../common/interfaces/request-context.interface.js';

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

@ApiTags('Facturas Batch')
@Controller('api/v1/facturas/batch')
@UseGuards(JwtAuthGuard, RolesGuard)
export class BatchFacturasController {
  constructor(private readonly batchService: BatchFacturasService) {}

  /**
   * POST /api/v1/facturas/batch/validar
   * Sube un archivo CSV/Excel y valida su estructura y contenido.
   * Retorna preview con errores por fila sin emitir facturas.
   * Roles: admin, facturador
   */
  @Post('validar')
  @Roles('admin', 'facturador')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(FileInterceptor('archivo', { limits: { fileSize: MAX_FILE_SIZE } }))
  async validar(
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) {
      throw new BadRequestException('Debe enviar un archivo en el campo "archivo"');
    }

    const ext = file.originalname.toLowerCase().split('.').pop();
    if (!['xlsx', 'xls', 'csv'].includes(ext || '')) {
      throw new BadRequestException('Formato no soportado. Use .xlsx, .xls o .csv');
    }

    return this.batchService.validarArchivo(file.buffer, file.originalname);
  }

  /**
   * POST /api/v1/facturas/batch/emitir
   * Sube un archivo CSV/Excel, lo valida, y emite las facturas válidas.
   * Retorna reporte con resultados por factura.
   * Roles: admin, facturador
   */
  @Post('emitir')
  @Roles('admin', 'facturador')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(FileInterceptor('archivo', { limits: { fileSize: MAX_FILE_SIZE } }))
  async emitir(
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: RequestContext,
    @Req() req: Request,
  ) {
    if (!file) {
      throw new BadRequestException('Debe enviar un archivo en el campo "archivo"');
    }

    const ext = file.originalname.toLowerCase().split('.').pop();
    if (!['xlsx', 'xls', 'csv'].includes(ext || '')) {
      throw new BadRequestException('Formato no soportado. Use .xlsx, .xls o .csv');
    }

    const correlationId =
      getCorrelationId() ??
      (req as Request & { correlationId?: string }).correlationId ??
      `batch-${Date.now()}`;

    return this.batchService.emitirLote(
      file.buffer,
      file.originalname,
      user,
      correlationId,
    );
  }

  /**
   * GET /api/v1/facturas/batch/plantilla
   * Descarga un archivo Excel de plantilla con las columnas requeridas y ejemplos.
   * Roles: admin, facturador
   */
  @Get('plantilla')
  @Roles('admin', 'facturador')
  async descargarPlantilla(@Res() res: Response) {
    const buffer = await this.batchService.generarPlantilla();

    res.set({
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename="plantilla-facturas.xlsx"',
      'Content-Length': buffer.length.toString(),
    });

    res.send(buffer);
  }
}
