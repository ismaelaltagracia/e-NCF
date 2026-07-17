import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';

import { RetryQueueService } from './retry-queue.service.js';
import { RetryQueueProcessor } from './retry-queue.processor.js';
import { FacturaElectronica } from '../../database/entities/factura-electronica.entity.js';
import { DgiiModule } from '../../dgii/dgii.module.js';

/**
 * Módulo de cola de reintentos con BullMQ.
 *
 * Provee:
 * - RetryQueueService: para encolar trabajos de transmisión y subida
 * - RetryQueueProcessor: worker que procesa los jobs con integración al Circuit Breaker
 *
 * Configuración Redis desde variables de entorno:
 * - REDIS_HOST (default: localhost)
 * - REDIS_PORT (default: 6379)
 * - REDIS_PASSWORD (default: '')
 *
 * BullMQ:
 * - Cola: dgii-transmision (5 intentos, backoff exponencial 5s base)
 * - Cola: dgii-subida (3 intentos, backoff exponencial 5s base)
 *
 * @see Requisitos 19.1, 19.2, 19.3, 19.4, 19.5, 19.6
 */
@Module({
  imports: [
    ConfigModule,
    TypeOrmModule.forFeature([FacturaElectronica]),
    DgiiModule,
  ],
  providers: [RetryQueueService, RetryQueueProcessor],
  exports: [RetryQueueService],
})
export class RetryQueueModule {}
