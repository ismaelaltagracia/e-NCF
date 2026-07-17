import {
  Injectable,
  Logger,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import CircuitBreaker from 'opossum';

/**
 * Interfaz del servicio de Circuit Breaker para llamadas a DGII.
 * @see Requisitos 12.1, 12.2, 12.3, 12.4, 12.5
 */
export interface ICircuitBreakerService {
  execute<T>(operation: () => Promise<T>, context: string): Promise<T>;
  getState(): 'CLOSED' | 'OPEN' | 'HALF-OPEN';
  getTimeToHalfOpen(): number;
}

/**
 * Circuit Breaker configuration constants.
 * @see Design: opossum config
 */
const CB_OPTIONS: CircuitBreaker.Options = {
  timeout: 30_000, // 30s timeout per operation
  resetTimeout: 30_000, // 30s en OPEN antes de HALF-OPEN
  volumeThreshold: 5, // Mínimo 5 solicitudes para abrir
  rollingCountTimeout: 60_000, // Ventana de 60s
  rollingCountBuckets: 10, // 10 buckets para rolling window
  errorThresholdPercentage: 50, // Porcentaje de errores para abrir (con volumeThreshold 5)
};

/**
 * Servicio de Circuit Breaker que envuelve las llamadas a endpoints de la DGII.
 *
 * Estados:
 * - CLOSED: llamadas pasan normalmente
 * - OPEN: rechaza llamadas inmediatamente con 503 + Retry-After
 * - HALF-OPEN: permite una llamada de prueba para verificar recuperación
 *
 * Transiciones:
 * - CLOSED → OPEN: tras 5 fallos dentro de una ventana de 60s
 * - OPEN → HALF-OPEN: tras 30s de espera (resetTimeout)
 * - HALF-OPEN → CLOSED: si la llamada de prueba es exitosa
 * - HALF-OPEN → OPEN: si la llamada de prueba falla
 *
 * @see Requisitos 12.1, 12.2, 12.3, 12.4, 12.5
 */
@Injectable()
export class CircuitBreakerService implements ICircuitBreakerService {
  private readonly logger = new Logger(CircuitBreakerService.name);
  private readonly breaker: CircuitBreaker;
  private openedAt: number | null = null;

  constructor() {
    // Create circuit breaker wrapping a pass-through function.
    // The actual operation is passed to fire() at call time.
    this.breaker = new CircuitBreaker(
      (operation: () => Promise<unknown>) => operation(),
      CB_OPTIONS,
    );

    this.registerEventListeners();
  }

  /**
   * Ejecuta una operación asíncrona a través del circuit breaker.
   *
   * @param operation - Función asíncrona a ejecutar (llamada a DGII)
   * @param context - Descripción del contexto para logging
   * @returns Resultado de la operación
   * @throws HttpException 503 con Retry-After cuando el circuito está OPEN
   */
  async execute<T>(operation: () => Promise<T>, context: string): Promise<T> {
    if (this.breaker.opened) {
      const retryAfter = Math.ceil(this.getTimeToHalfOpen() / 1000);
      this.logger.warn(
        `Circuit breaker OPEN - rechazando llamada: ${context}. Retry-After: ${retryAfter}s`,
      );
      throw new HttpException(
        {
          statusCode: HttpStatus.SERVICE_UNAVAILABLE,
          message: `Servicio DGII temporalmente no disponible (circuit breaker abierto)`,
          error: 'Service Unavailable',
          retryAfter,
        },
        HttpStatus.SERVICE_UNAVAILABLE,
        {
          cause: new Error('Circuit breaker is OPEN'),
          description: `Retry-After: ${retryAfter}`,
        },
      );
    }

    try {
      const result = await this.breaker.fire(operation);
      return result as T;
    } catch (error: unknown) {
      // If the circuit just opened due to this failure, throw 503
      if (this.breaker.opened) {
        const retryAfter = Math.ceil(this.getTimeToHalfOpen() / 1000);
        this.logger.warn(
          `Circuit breaker abierto tras fallo: ${context}. Retry-After: ${retryAfter}s`,
        );
        throw new HttpException(
          {
            statusCode: HttpStatus.SERVICE_UNAVAILABLE,
            message: `Servicio DGII temporalmente no disponible (circuit breaker abierto)`,
            error: 'Service Unavailable',
            retryAfter,
          },
          HttpStatus.SERVICE_UNAVAILABLE,
          {
            cause: error instanceof Error ? error : new Error(String(error)),
            description: `Retry-After: ${retryAfter}`,
          },
        );
      }

      // Re-throw the original error if circuit is not open
      throw error;
    }
  }

  /**
   * Retorna el estado actual del circuit breaker.
   * @returns 'CLOSED' | 'OPEN' | 'HALF-OPEN'
   */
  getState(): 'CLOSED' | 'OPEN' | 'HALF-OPEN' {
    if (this.breaker.halfOpen) {
      return 'HALF-OPEN';
    }
    if (this.breaker.opened) {
      return 'OPEN';
    }
    return 'CLOSED';
  }

  /**
   * Retorna los milisegundos restantes hasta la transición a HALF-OPEN.
   * Retorna 0 si el circuito no está en estado OPEN.
   */
  getTimeToHalfOpen(): number {
    if (!this.breaker.opened || this.openedAt === null) {
      return 0;
    }

    const elapsed = Date.now() - this.openedAt;
    const remaining = CB_OPTIONS.resetTimeout! - elapsed;
    return Math.max(0, remaining);
  }

  /**
   * Registra event listeners para logging de transiciones de estado.
   */
  private registerEventListeners(): void {
    this.breaker.on('open', () => {
      this.openedAt = Date.now();
      this.logger.warn('Circuit breaker: CLOSED → OPEN');
    });

    this.breaker.on('halfOpen', () => {
      this.logger.log('Circuit breaker: OPEN → HALF-OPEN');
    });

    this.breaker.on('close', () => {
      this.openedAt = null;
      this.logger.log('Circuit breaker: HALF-OPEN → CLOSED');
    });
  }
}
