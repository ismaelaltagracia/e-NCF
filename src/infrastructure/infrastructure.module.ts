import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { STORAGE_PROVIDER } from './storage/storage.interface.js';
import { MinioStorageAdapter } from './storage/minio-storage.adapter.js';
import { SECRETS_PROVIDER } from './secrets/secrets.interface.js';
import { EnvSecretsAdapter } from './secrets/env-secrets.adapter.js';
import { QR_GENERATOR } from './pdf/qr-generator.interface.js';
import { QrGeneratorService } from './pdf/qr-generator.service.js';
import { PDF_GENERATOR } from './pdf/pdf-generator.interface.js';
import { PdfGeneratorService } from './pdf/pdf-generator.service.js';
import { FacturaElectronica } from '../database/entities/factura-electronica.entity.js';

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
  imports: [ConfigModule, TypeOrmModule.forFeature([FacturaElectronica])],
  providers: [
    {
      provide: STORAGE_PROVIDER,
      useClass: MinioStorageAdapter,
    },
    {
      provide: SECRETS_PROVIDER,
      useClass: EnvSecretsAdapter,
    },
    {
      provide: QR_GENERATOR,
      useClass: QrGeneratorService,
    },
    {
      provide: PDF_GENERATOR,
      useClass: PdfGeneratorService,
    },
  ],
  exports: [STORAGE_PROVIDER, SECRETS_PROVIDER, QR_GENERATOR, PDF_GENERATOR],
})
export class InfrastructureModule {}
