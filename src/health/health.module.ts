import { Module } from '@nestjs/common';
import { InfrastructureModule } from '../infrastructure/infrastructure.module.js';
import { AuthModule } from '../modules/auth/auth.module.js';
import { HealthController } from './health.controller.js';
import { HealthService } from './health.service.js';
import { BackupStatusService } from './backup-status.service.js';

/**
 * Módulo de health check que expone endpoints para monitoreo
 * del estado de la API y sus dependencias.
 *
 * Depende de:
 * - DatabaseModule (TypeORM DataSource) - global via AppModule
 * - RedisModule (REDIS_CLIENT) - global
 * - InfrastructureModule (STORAGE_PROVIDER)
 * - ConfigModule - global
 * - AuthModule (JwtAuthGuard para /health/backup)
 *
 * @see Requisitos 20.1, 20.2, 20.3, 20.4, 34.6
 */
@Module({
  imports: [InfrastructureModule, AuthModule],
  controllers: [HealthController],
  providers: [HealthService, BackupStatusService],
})
export class HealthModule {}
