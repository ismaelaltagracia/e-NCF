import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { STORAGE_PROVIDER } from './storage/storage.interface.js';
import { MinioStorageAdapter } from './storage/minio-storage.adapter.js';
import { SECRETS_PROVIDER } from './secrets/secrets.interface.js';
import { EnvSecretsAdapter } from './secrets/env-secrets.adapter.js';

/**
 * Módulo de infraestructura que provee implementaciones concretas
 * de los proveedores de almacenamiento y secretos.
 *
 * Usa inyección de dependencias de NestJS para desacoplar
 * la lógica de negocio de las implementaciones de infraestructura.
 *
 * @see Requisito 24.3, 24.5
 */
@Module({
  imports: [ConfigModule],
  providers: [
    {
      provide: STORAGE_PROVIDER,
      useClass: MinioStorageAdapter,
    },
    {
      provide: SECRETS_PROVIDER,
      useClass: EnvSecretsAdapter,
    },
  ],
  exports: [STORAGE_PROVIDER, SECRETS_PROVIDER],
})
export class InfrastructureModule {}
