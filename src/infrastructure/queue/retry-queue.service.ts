import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import {
  IRetryQueueService,
  TransmisionJob,
  SubidaJob,
  QUEUE_NAMES,
} from './retry-queue.interfaces.js';
import { FacturaElectronica } from '../../database/entities/factura-electronica.entity.js';
import { EstadoDgii } from '../../database/enums.js';

/**
 * Servicio de cola de reintentos con BullMQ.
 * Encola trabajos de transmisión y subida con backoff exponencial.
 *
 * Configuración:
 * - 5 intentos máximos
 * - Backoff exponencial: 5s, 10s, 20s, 40s, 80s
 * - Se pausa cuando el Circuit Breaker está OPEN
 *
 * @see Requisitos 19.1, 19.2, 19.3, 19.4, 19.5, 19.6
 */
@Injectable()
export class RetryQueueService implements IRetryQueueService, OnModuleDestroy {
  private readonly logger = new Logger(RetryQueueService.name);
  private readonly transmisionQueue: Queue;
  private readonly subidaQueue: Queue;

  constructor(
    private readonly configService: ConfigService,
    @InjectRepository(FacturaElectronica)
    private readonly facturaRepository: Repository<FacturaElectronica>,
  ) {
    const redisConnection = {
      host: this.configService.get<string>('REDIS_HOST', 'localhost'),
      port: this.configService.get<number>('REDIS_PORT', 6379),
      password: this.configService.get<string>('REDIS_PASSWORD', '') || undefined,
    };

    this.transmisionQueue = new Queue(QUEUE_NAMES.TRANSMISION, {
      connection: redisConnection,
      defaultJobOptions: {
        attempts: 5,
        backoff: {
          type: 'exponential',
          delay: 5000,
        },
        removeOnComplete: { count: 100 },
        removeOnFail: { count: 500 },
      },
    });

    this.subidaQueue = new Queue(QUEUE_NAMES.SUBIDA, {
      connection: redisConnection,
      defaultJobOptions: {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 5000,
        },
        removeOnComplete: { count: 100 },
        removeOnFail: { count: 500 },
      },
    });

    this.logger.log('RetryQueueService inicializado con colas BullMQ');
  }

  /**
   * Encola un trabajo de transmisión a la DGII.
   * Actualiza el estado_dgii de la factura a "reintentando".
   *
   * @param job - Datos del trabajo de transmisión
   * @returns ID del job encolado
   */
  async encolarTransmision(job: TransmisionJob): Promise<string> {
    // Actualizar estado a reintentando
    await this.facturaRepository.update(
      { id: job.factura_id },
      { estado_dgii: EstadoDgii.REINTENTANDO },
    );

    const bullJob = await this.transmisionQueue.add(
      'transmitir-ecf',
      job,
      {
        jobId: `tx-${job.factura_id}-${job.intento}`,
      },
    );

    this.logger.log(
      `Transmisión encolada: factura=${job.factura_id}, intento=${job.intento}, ` +
      `correlationId=${job.correlation_id}, jobId=${bullJob.id}`,
    );

    return bullJob.id!;
  }

  /**
   * Encola un trabajo de subida al almacenamiento de objetos.
   *
   * @param job - Datos del trabajo de subida
   * @returns ID del job encolado
   */
  async encolarSubida(job: SubidaJob): Promise<string> {
    const bullJob = await this.subidaQueue.add(
      `subir-${job.tipo}`,
      job,
      {
        jobId: `upload-${job.tipo}-${job.factura_id}-${job.intento}`,
      },
    );

    this.logger.log(
      `Subida encolada: factura=${job.factura_id}, tipo=${job.tipo}, ` +
      `intento=${job.intento}, correlationId=${job.correlation_id}, jobId=${bullJob.id}`,
    );

    return bullJob.id!;
  }

  /**
   * Pausa la ejecución de trabajos de reintento.
   * Se invoca cuando el Circuit Breaker pasa a estado OPEN.
   */
  async pausar(): Promise<void> {
    await this.transmisionQueue.pause();
    this.logger.warn('Cola de transmisión pausada (Circuit Breaker OPEN)');
  }

  /**
   * Reanuda la ejecución de trabajos de reintento.
   * Se invoca cuando el Circuit Breaker pasa a HALF-OPEN o CLOSED.
   */
  async reanudar(): Promise<void> {
    await this.transmisionQueue.resume();
    this.logger.log('Cola de transmisión reanudada (Circuit Breaker CLOSED/HALF-OPEN)');
  }

  /**
   * Cierra las conexiones de las colas al destruir el módulo.
   */
  async onModuleDestroy(): Promise<void> {
    await this.transmisionQueue.close();
    await this.subidaQueue.close();
    this.logger.log('Colas BullMQ cerradas');
  }
}
