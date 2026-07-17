import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Worker, Job } from 'bullmq';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import {
  TransmisionJob,
  QUEUE_NAMES,
  BusinessRejectionError,
  CircuitBreakerOpenError,
} from './retry-queue.interfaces.js';
import { CircuitBreakerService } from '../../dgii/circuit-breaker.service.js';
import { FacturaElectronica } from '../../database/entities/factura-electronica.entity.js';
import { EstadoDgii } from '../../database/enums.js';

/**
 * Procesador de trabajos de la cola de transmisión.
 * Maneja la lógica de reintento con integración al Circuit Breaker.
 *
 * Comportamiento:
 * - Verifica el estado del Circuit Breaker antes de procesar
 * - Si CB está OPEN, pausa el worker
 * - Distingue entre rechazos de negocio (no reintentar) y errores transitorios (reintentar)
 * - Actualiza estado_dgii en cada transición
 *
 * @see Requisitos 19.1, 19.2, 19.3, 19.4, 19.5, 19.6
 */
@Injectable()
export class RetryQueueProcessor implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RetryQueueProcessor.name);
  private worker!: Worker;

  constructor(
    private readonly configService: ConfigService,
    private readonly circuitBreakerService: CircuitBreakerService,
    @InjectRepository(FacturaElectronica)
    private readonly facturaRepository: Repository<FacturaElectronica>,
  ) {}

  onModuleInit(): void {
    const redisConnection = {
      host: this.configService.get<string>('REDIS_HOST', 'localhost'),
      port: this.configService.get<number>('REDIS_PORT', 6379),
      password: this.configService.get<string>('REDIS_PASSWORD', '') || undefined,
    };

    this.worker = new Worker(
      QUEUE_NAMES.TRANSMISION,
      async (job: Job<TransmisionJob>) => this.processTransmision(job),
      {
        connection: redisConnection,
        concurrency: 1,
      },
    );

    this.worker.on('completed', (job: Job<TransmisionJob>) => {
      this.logger.log(
        `Job completado: factura=${job.data.factura_id}, correlationId=${job.data.correlation_id}`,
      );
    });

    this.worker.on('failed', (job: Job<TransmisionJob> | undefined, error: Error) => {
      if (job) {
        this.logger.error(
          `Job fallido: factura=${job.data.factura_id}, intento=${job.attemptsMade}/${job.opts.attempts}, ` +
          `error=${error.message}, correlationId=${job.data.correlation_id}`,
        );

        // Si se agotaron los reintentos, marcar como fallido
        if (job.attemptsMade >= (job.opts.attempts ?? 5)) {
          this.handleMaxRetriesExceeded(job).catch((err) => {
            this.logger.error(
              `Error actualizando estado tras max reintentos: ${err.message}`,
            );
          });
        }
      }
    });

    this.worker.on('error', (error: Error) => {
      this.logger.error(`Worker error: ${error.message}`);
    });

    this.logger.log('Worker de transmisión inicializado');

    // Verificar estado del CB al inicio
    if (this.circuitBreakerService.getState() === 'OPEN') {
      this.worker.pause().then(() => {
        this.logger.warn('Worker pausado al inicio (Circuit Breaker OPEN)');
      });
    }
  }

  /**
   * Procesa un trabajo de transmisión.
   * Verifica el Circuit Breaker y maneja diferentes tipos de error.
   */
  private async processTransmision(job: Job<TransmisionJob>): Promise<void> {
    const { factura_id, correlation_id } = job.data;

    this.logger.log(
      `Procesando transmisión: factura=${factura_id}, intento=${job.attemptsMade + 1}, ` +
      `correlationId=${correlation_id}`,
    );

    // Verificar Circuit Breaker
    const cbState = this.circuitBreakerService.getState();
    if (cbState === 'OPEN') {
      // Pausar el worker y lanzar error que no cuenta como intento
      await this.worker.pause();
      this.logger.warn(
        `Circuit Breaker OPEN - pausando worker. factura=${factura_id}`,
      );
      throw new CircuitBreakerOpenError();
    }

    // Ejecutar la transmisión a través del Circuit Breaker
    try {
      await this.circuitBreakerService.execute(
        () => this.transmitirADgii(job.data),
        `retry-transmision:${factura_id}`,
      );

      // Éxito: actualizar estado a aceptado
      // Nota: el track_id se extraerá del response en la implementación real
      await this.facturaRepository.update(
        { id: factura_id },
        { estado_dgii: EstadoDgii.ACEPTADO },
      );

      this.logger.log(
        `Transmisión exitosa: factura=${factura_id}, correlationId=${correlation_id}`,
      );
    } catch (error: unknown) {
      if (error instanceof BusinessRejectionError) {
        // Rechazo de negocio: no reintentar, marcar como rechazado
        await this.facturaRepository.update(
          { id: factura_id },
          {
            estado_dgii: EstadoDgii.RECHAZADO,
            error_dgii: (error.dgiiErrors ?? { message: error.message }) as any,
          },
        );

        this.logger.warn(
          `Rechazo de negocio (no se reintenta): factura=${factura_id}, ` +
          `statusCode=${error.statusCode}, correlationId=${correlation_id}`,
        );

        // No lanzar error para que BullMQ no reintente
        // Marcar el job como completado (con rechazo) retornando sin throw
        return;
      }

      if (error instanceof CircuitBreakerOpenError) {
        throw error;
      }

      // Error transitorio: dejar que BullMQ reintente
      this.logger.warn(
        `Error transitorio en transmisión: factura=${factura_id}, ` +
        `error=${error instanceof Error ? error.message : String(error)}, ` +
        `correlationId=${correlation_id}`,
      );

      throw error;
    }
  }

  /**
   * Placeholder para la transmisión real al endpoint de la DGII.
   * Será reemplazado por la implementación del TransmisionService en la tarea 9.7.
   *
   * @param job - Datos del trabajo de transmisión
   */
  private async transmitirADgii(_job: TransmisionJob): Promise<void> {
    // Este método será reemplazado por la inyección del TransmisionService
    // cuando se implemente la tarea 9.7
    throw new Error(
      'TransmisionService no implementado. Este método será reemplazado por el servicio de transmisión real.',
    );
  }

  /**
   * Maneja cuando se exceden los reintentos máximos.
   * Actualiza el estado a "fallido" y emite evento de notificación.
   */
  private async handleMaxRetriesExceeded(job: Job<TransmisionJob>): Promise<void> {
    const { factura_id, empresa_id, correlation_id } = job.data;

    await this.facturaRepository.update(
      { id: factura_id },
      {
        estado_dgii: EstadoDgii.FALLIDO,
        error_dgii: {
          message: 'Máximo de reintentos alcanzado',
          max_intentos: job.opts.attempts,
          ultimo_error: job.failedReason,
        },
      },
    );

    this.logger.error(
      `Máximo de reintentos alcanzado: factura=${factura_id}, empresa=${empresa_id}, ` +
      `correlationId=${correlation_id}`,
    );

    // Evento para el sistema de notificaciones (webhook, email, etc.)
    // Se implementará cuando exista EventEmitter2 en el proyecto
    this.logger.warn(
      `[EVENTO] transmision.fallida: factura_id=${factura_id}, ` +
      `empresa_id=${empresa_id}, correlation_id=${correlation_id}`,
    );
  }

  /**
   * Pausa el worker externamente (invocado por RetryQueueService).
   */
  async pauseWorker(): Promise<void> {
    if (this.worker) {
      await this.worker.pause();
    }
  }

  /**
   * Reanuda el worker externamente (invocado por RetryQueueService).
   */
  async resumeWorker(): Promise<void> {
    if (this.worker) {
      await this.worker.resume();
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (this.worker) {
      await this.worker.close();
      this.logger.log('Worker de transmisión cerrado');
    }
  }
}
