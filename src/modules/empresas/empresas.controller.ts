import { ApiTags } from '@nestjs/swagger';
import {
  Controller,
  Post,
  Get,
  Patch,
  Body,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { ConfigService } from '@nestjs/config';

import { EmpresasService } from './empresas.service.js';
import type { CertificadoUploadResult } from './empresas.service.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../../common/guards/roles.guard.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe.js';
import type { RequestContext } from '../../common/interfaces/request-context.interface.js';
import { PlanesService } from '../planes/planes.service.js';
import type { UsoActualResponse } from '../planes/planes.service.js';
import { ALLOWED_EXTENSIONS, MAX_FILE_SIZE } from './dto/certificado.schemas.js';
import {
  UpdateConfiguracionSchema,
  type UpdateConfiguracionDto,
  type ConfiguracionResponse,
} from './dto/configuracion.schemas.js';

import * as path from 'node:path';

@ApiTags('Empresa')
@Controller('api/v1/empresas')
@UseGuards(JwtAuthGuard, RolesGuard)
export class EmpresasController {
  constructor(
    private readonly empresasService: EmpresasService,
    private readonly planesService: PlanesService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * GET /api/v1/empresas/me/ambiente-dgii
   * Retorna el ambiente actual de la DGII (certificacion o produccion).
   * @see Gap 5: Toggle Certificación ↔ Producción
   */
  @Get('me/ambiente-dgii')
  @Roles('admin', 'facturador', 'lector')
  @HttpCode(HttpStatus.OK)
  getAmbienteDgii(): { ambiente: string; urls: Record<string, string> } {
    const ambiente = this.configService.get<string>('DGII_AMBIENTE', 'certificacion');
    const basePath = ambiente === 'produccion' ? 'ECF' : 'CerteCF';
    return {
      ambiente,
      urls: {
        semilla: `https://ecf.dgii.gov.do/${basePath}/WSCertificacion/CertECF.asmx`,
        token: `https://ecf.dgii.gov.do/${basePath}/WSCertificacion/CertECF.asmx`,
        ecf: `https://ecf.dgii.gov.do/${basePath}/WSCertificacion/CertECFComunicacion.asmx`,
        estado: `https://ecf.dgii.gov.do/${basePath}/ConsultaEstado/ConsultaEstadoCertECF.asmx`,
      },
    };
  }

  /**
   * GET /api/v1/empresas/me/uso
   * Consulta el uso actual de facturación del mes para la empresa autenticada.
   * Req 27.9
   */
  @Get('me/uso')
  @Roles('admin', 'facturador', 'lector')
  @HttpCode(HttpStatus.OK)
  async getUsoActual(@CurrentUser() user: RequestContext): Promise<UsoActualResponse> {
    return this.planesService.getUsoActual(user.empresa_id);
  }

  /**
   * POST /api/v1/empresas/me/certificado
   * Sube un certificado PKCS12 (.p12/.pfx) para la empresa del usuario autenticado.
   * Solo accesible por usuarios con rol "admin".
   */
  @Post('me/certificado')
  @Roles('admin')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(
    FileInterceptor('certificado', {
      storage: memoryStorage(),
      limits: { fileSize: MAX_FILE_SIZE },
      fileFilter: (_req, file, callback) => {
        const ext = path.extname(file.originalname).toLowerCase();
        if (!ALLOWED_EXTENSIONS.includes(ext)) {
          return callback(
            new BadRequestException(
              `Formato no permitido. Solo se aceptan archivos con extensión: ${ALLOWED_EXTENSIONS.join(', ')}`,
            ),
            false,
          );
        }
        callback(null, true);
      },
    }),
  )
  async uploadCertificado(
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body('password') password: string | undefined,
    @CurrentUser() user: RequestContext,
  ): Promise<CertificadoUploadResult> {
    if (!file) {
      throw new BadRequestException('El archivo de certificado es requerido');
    }

    if (file.size > MAX_FILE_SIZE) {
      throw new BadRequestException(
        `El archivo excede el tamaño máximo permitido de ${MAX_FILE_SIZE / 1024} KB`,
      );
    }

    if (!password || password.trim().length === 0) {
      throw new BadRequestException('La contraseña del certificado es requerida');
    }

    return this.empresasService.uploadCertificado(user.empresa_id, file.buffer, password);
  }

  /**
   * PATCH /api/v1/empresas/me/configuracion
   * Actualiza la configuración de la empresa (modo_ncf, validar_rnc_receptor, formato_pdf).
   * Solo accesible por usuarios con rol "admin".
   * Req 28.8
   */
  @Patch('me/configuracion')
  @Roles('admin')
  @HttpCode(HttpStatus.OK)
  async updateConfiguracion(
    @Body(new ZodValidationPipe(UpdateConfiguracionSchema)) dto: UpdateConfiguracionDto,
    @CurrentUser() user: RequestContext,
  ): Promise<ConfiguracionResponse> {
    return this.empresasService.updateConfiguracion(user.empresa_id, dto);
  }
}
