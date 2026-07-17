import { ApiTags } from '@nestjs/swagger';
import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { HealthService } from './health.service.js';
import { BackupStatusService } from './backup-status.service.js';
import { JwtAuthGuard } from '../modules/auth/guards/jwt-auth.guard.js';
import { SuperAdminGuard } from '../common/guards/super-admin.guard.js';

/**
 * Controlador de health check para monitoreo del estado de la API y sus dependencias.
 *
 * @see Requisitos 20.1, 20.2, 20.3, 20.4, 34.6
 */
@ApiTags('Health')
@Controller('health')
export class HealthController {
  constructor(
    private readonly healthService: HealthService,
    private readonly backupStatusService: BackupStatusService,
  ) {}

  /**
   * GET /health
   * Retorna el estado general de la API más el estado de conexión de cada dependencia
   * (PostgreSQL, Redis, MinIO) con latencia medida por dependencia.
   *
   * - 200: status "up" o "degraded"
   * - 503: status "down" (PostgreSQL o Redis caídos)
   */
  @Get()
  @HttpCode(HttpStatus.OK)
  async getHealth(@Res() res: Response): Promise<void> {
    const result = await this.healthService.checkHealth();

    const statusCode =
      result.status === 'down'
        ? HttpStatus.SERVICE_UNAVAILABLE
        : HttpStatus.OK;

    res.status(statusCode).json(result);
  }

  /**
   * GET /health/dgii
   * Verifica conectividad con el endpoint semilla de la DGII (timeout 10s).
   */
  @Get('dgii')
  @HttpCode(HttpStatus.OK)
  async getDgiiHealth(@Res() res: Response): Promise<void> {
    const result = await this.healthService.checkDgii();

    const statusCode =
      result.status === 'down'
        ? HttpStatus.SERVICE_UNAVAILABLE
        : HttpStatus.OK;

    res.status(statusCode).json(result);
  }

  /**
   * GET /health/backup
   * Retorna el estado del último backup de la base de datos.
   * Solo accesible para Super_Admin.
   *
   * - 200: información del último backup
   * - 404: no hay backup registrado aún
   *
   * @see Requisitos 34.5, 34.6
   */
  @Get('backup')
  @UseGuards(JwtAuthGuard, SuperAdminGuard)
  async getBackupHealth(@Res() res: Response): Promise<void> {
    const status = await this.backupStatusService.getLastBackupStatus();

    if (!status) {
      res.status(HttpStatus.NOT_FOUND).json({
        message: 'No backup has been executed yet',
      });
      return;
    }

    res.status(HttpStatus.OK).json(status);
  }
}
