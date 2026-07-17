/**
 * Interfaces para la cola de reintentos con BullMQ.
 * Define los contratos de servicio y las estructuras de datos
 * para el encolamiento de transmisiones y subidas.
 *
 * @see Requisitos 19.1, 19.2, 19.3, 19.4, 19.5, 19.6
 */

/**
 * Datos del trabajo de transmisión a la DGII.
 */
export interface TransmisionJob {
  factura_id: string;
  empresa_id: string;
  xml_firmado: string;
  correlation_id: string;
  intento: number;
}

/**
 * Datos del trabajo de subida a almacenamiento de objetos.
 */
export interface SubidaJob {
  factura_id: string;
  empresa_id: string;
  tipo: 'xml' | 'pdf';
  data_base64: string;
  bucket: string;
  key: string;
  content_type: string;
  correlation_id: string;
  intento: number;
}

/**
 * Interfaz del servicio de cola de reintentos.
 */
export interface IRetryQueueService {
  encolarTransmision(job: TransmisionJob): Promise<string>;
  encolarSubida(job: SubidaJob): Promise<string>;
  pausar(): Promise<void>;
  reanudar(): Promise<void>;
}

/**
 * Token de inyección para el servicio de cola de reintentos.
 */
export const RETRY_QUEUE_SERVICE = Symbol('RETRY_QUEUE_SERVICE');

/**
 * Nombres de las colas.
 */
export const QUEUE_NAMES = {
  TRANSMISION: 'dgii-transmision',
  SUBIDA: 'dgii-subida',
} as const;

/**
 * Error que indica un rechazo de negocio de la DGII (no debe reintentarse).
 */
export class BusinessRejectionError extends Error {
  public readonly statusCode: number;
  public readonly dgiiErrors: Record<string, unknown> | null;

  constructor(message: string, statusCode: number, dgiiErrors?: Record<string, unknown>) {
    super(message);
    this.name = 'BusinessRejectionError';
    this.statusCode = statusCode;
    this.dgiiErrors = dgiiErrors ?? null;
  }
}

/**
 * Error que indica que el Circuit Breaker está abierto.
 * Este error NO debe contar como intento fallido.
 */
export class CircuitBreakerOpenError extends Error {
  constructor() {
    super('Circuit breaker is OPEN - worker paused');
    this.name = 'CircuitBreakerOpenError';
  }
}
