import {
  Injectable,
  Logger,
  Inject,
  Optional,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type Redis from 'ioredis';

import { DgiiTokenService } from './token.service.js';
import { CircuitBreakerService } from './circuit-breaker.service.js';
import { REDIS_CLIENT } from '../common/guards/rate-limit.guard.js';
import { getCorrelationId } from '../common/interceptors/correlation-id.interceptor.js';
import {
  IRetryQueueService,
  RETRY_QUEUE_SERVICE,
} from '../infrastructure/queue/retry-queue.interfaces.js';

const TIMEOUT_MS = 30_000;
const REDIS_KEY_PREFIX = 'dgii_token:';

/**
 * Parámetros de entrada para la transmisión de un e-CF firmado a la DGII.
 */
export interface TransmisionParams {
  factura_id: string;
  empresa_id: string;
  xml_firmado: string;
  correlation_id: string;
  ambiente?: string;
  /**
   * Nombre del archivo XML para el multipart, con convención RNC+eNCF.xml
   * (ej: "101672919E310000000001.xml"). Si no se provee, se usa un nombre genérico.
   */
  nombre_archivo?: string;
}

/**
 * Resultado de la transmisión a la DGII.
 */
export interface TransmisionResult {
  track_id: string | null;
  estado: 'aceptado' | 'rechazado' | 'reintentando';
  error_dgii?: Record<string, unknown>;
}

/**
 * Extrae el Track_ID de la respuesta XML de la DGII.
 */
function extractTrackId(responseXml: string): string | null {
  const match = responseXml.match(
    /<(?:[a-zA-Z_][\w.-]*:)?[Tt]rack[Ii]d[^>]*>([\s\S]*?)<\/(?:[a-zA-Z_][\w.-]*:)?[Tt]rack[Ii]d>/,
  );
  return match?.[1]?.trim() ?? null;
}

/**
 * Servicio de transmisión de documentos e-CF firmados al endpoint de la DGII.
 *
 * Flujo:
 * 1. Obtener Bearer Token via DgiiTokenService
 * 2. Enviar XML firmado al endpoint e-CF de la DGII (30s timeout) via CircuitBreaker
 * 3. Si éxito → extraer Track_ID y retornar estado 'aceptado'
 * 4. Si 401 → invalidar token cache, re-handshake y reintentar una vez
 * 5. Si error transitorio (5xx, timeout, red) → encolar en BullMQ
 * 6. Si CB abierto → encolar en BullMQ
 * 7. Si rechazo de negocio (4xx != 401) → retornar 'rechazado' con detalles
 *
 * @see Requisitos 11.1, 11.2, 11.3, 11.4, 11.5
 */
@Injectable()
export class TransmisionService {
  private readonly logger = new Logger(TransmisionService.name);
  private readonly dgiiEcfUrl: string;

  constructor(
    private readonly tokenService: DgiiTokenService,
    private readonly circuitBreaker: CircuitBreakerService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly configService: ConfigService,
    @Optional()
    @Inject(RETRY_QUEUE_SERVICE)
    private readonly retryQueue: IRetryQueueService | null,
  ) {
    this.dgiiEcfUrl = this.configService.get<string>(
      'DGII_ECF_URL',
      'https://ecf.dgii.gov.do/CerteCF/recepcion/api/FacturasElectronicas',
    );
  }

  /**
   * Returns the DGII e-CF URL based on the ambiente.
   * En producción se usa el segmento de ruta "eCF" en lugar de "CerteCF".
   */
  private getDgiiEcfUrl(ambiente?: string): string {
    if (ambiente === 'produccion') {
      return this.dgiiEcfUrl.replace('/CerteCF/', '/eCF/');
    }
    return this.dgiiEcfUrl;
  }

  /**
   * Transmite un XML firmado al endpoint e-CF de la DGII.
   *
   * @param params - Parámetros de transmisión
   * @returns Resultado con track_id, estado y opcionalmente errores DGII
   * @see Requisitos 11.1, 11.2, 11.3, 11.4, 11.5
   */
  async transmitir(params: TransmisionParams): Promise<TransmisionResult> {
    const correlationId = params.correlation_id || getCorrelationId() || 'no-correlation';

    this.logger.log(
      `Transmitiendo e-CF a DGII: factura=${params.factura_id}, empresa=${params.empresa_id}, correlationId=${correlationId}`,
    );

    try {
      return await this.ejecutarTransmision(params, correlationId, false);
    } catch (error: unknown) {
      return this.manejarError(error, params, correlationId);
    }
  }

  /**
   * Transmite un e-CF firmado a la DGII para un reintento en cola (BullMQ).
   *
   * A diferencia de `transmitir()`, este método NO vuelve a encolar ante errores
   * transitorios ni gestiona su propio circuit breaker: se asume que el worker de
   * la cola (RetryQueueProcessor) ya envuelve la llamada en el circuit breaker y
   * gestiona los reintentos. Aquí solo obtenemos el token, llamamos al endpoint y
   * traducimos el resultado:
   *  - éxito → devuelve { estado: 'aceptado', track_id }
   *  - rechazo de negocio (4xx != 401) → devuelve { estado: 'rechazado', error_dgii }
   *  - 401 → invalida token y reintenta una vez; si persiste, lanza TransientError
   *  - error transitorio (5xx/red/timeout) → lanza TransientError (para que la cola reintente)
   *
   * @see Requisito 11.x / 19.x
   */
  async transmitirDirecto(params: TransmisionParams): Promise<TransmisionResult> {
    const correlationId = params.correlation_id || getCorrelationId() || 'no-correlation';

    const ejecutar = async (): Promise<TransmisionResult> => {
      const token = await this.tokenService.obtenerToken(params.empresa_id, params.ambiente);
      return this.llamarEndpointDgii(
        params.xml_firmado,
        token,
        correlationId,
        params.ambiente,
        params.nombre_archivo,
      );
    };

    try {
      return await ejecutar();
    } catch (error: unknown) {
      // Token expirado: invalidar cache, re-handshake y reintentar una vez
      if (error instanceof TokenExpiredError) {
        const cacheKey = `${REDIS_KEY_PREFIX}${params.empresa_id}`;
        try {
          await this.redis.del(cacheKey);
        } catch (redisError: unknown) {
          const message = redisError instanceof Error ? redisError.message : 'Unknown error';
          this.logger.warn(`No se pudo invalidar token en Redis durante reintento: ${message}`);
        }
        try {
          return await ejecutar();
        } catch (retryError: unknown) {
          // Si sigue expirando, tratarlo como transitorio para que la cola reintente luego
          const message = retryError instanceof Error ? retryError.message : 'Unknown error';
          throw new TransientError(`Re-handshake falló durante reintento: ${message}`);
        }
      }
      throw error;
    }
  }

  /**
   * Ejecuta la transmisión al endpoint de la DGII via el CircuitBreaker.
   * Si isRetry es true, no intentará re-handshake ante un 401.
   */
  private async ejecutarTransmision(
    params: TransmisionParams,
    correlationId: string,
    _isRetry: boolean,
  ): Promise<TransmisionResult> {
    const token = await this.tokenService.obtenerToken(params.empresa_id, params.ambiente);

    const result = await this.circuitBreaker.execute(
      () =>
        this.llamarEndpointDgii(
          params.xml_firmado,
          token,
          correlationId,
          params.ambiente,
          params.nombre_archivo,
        ),
      `transmision-ecf:${params.factura_id}`,
    );

    return result;
  }

  /**
   * Realiza la llamada HTTP al endpoint e-CF de la DGII con el Bearer Token.
   * Timeout: 30 segundos.
   *
   * @see Requisito 11.1: Transmitir con Bearer Token, timeout 30s
   */
  private async llamarEndpointDgii(
    xmlFirmado: string,
    token: string,
    correlationId: string,
    ambiente?: string,
    nombreArchivo?: string,
  ): Promise<TransmisionResult> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);
    const ecfUrl = this.getDgiiEcfUrl(ambiente);

    // La DGII espera el e-CF firmado como multipart/form-data en el campo "xml",
    // con el archivo nombrado RNC+eNCF.xml.
    const formData = new FormData();
    const blob = new Blob([xmlFirmado], { type: 'application/xml' });
    formData.append('xml', blob, nombreArchivo || 'ecf.xml');

    let response: Response;
    try {
      response = await fetch(ecfUrl, {
        method: 'POST',
        headers: {
          // No fijar Content-Type: fetch añade el boundary del multipart.
          Accept: 'application/json',
          Authorization: `Bearer ${token}`,
          'X-Correlation-Id': correlationId,
        },
        body: formData,
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
    } catch (error: unknown) {
      clearTimeout(timeoutId);
      const message = error instanceof Error ? error.message : 'Unknown error';
      throw new TransientError(`Error de red contactando DGII: ${message}`);
    }

    const responseBody = await response.text();

    // Req 11.2: Respuesta exitosa → extraer Track_ID
    if (response.ok) {
      const trackId = extractTrackId(responseBody);
      if (!trackId) {
        this.logger.warn(
          `Respuesta exitosa pero no se pudo extraer TrackId: correlationId=${correlationId}`,
        );
      }
      return {
        track_id: trackId,
        estado: 'aceptado',
      };
    }

    // Req 11.5: Token expirado (401) → señalar para re-handshake
    if (response.status === 401) {
      throw new TokenExpiredError('Token expirado - DGII respondió 401');
    }

    // Req 11.4: Error transitorio (5xx)
    if (response.status >= 500) {
      throw new TransientError(
        `DGII respondió con error ${response.status}: ${responseBody}`,
      );
    }

    // Req 11.3: Rechazo de negocio (4xx != 401)
    let errorDgii: Record<string, unknown> = {};
    try {
      errorDgii = JSON.parse(responseBody) as Record<string, unknown>;
    } catch {
      errorDgii = { raw_response: responseBody, status_code: response.status };
    }

    return {
      track_id: null,
      estado: 'rechazado',
      error_dgii: errorDgii,
    };
  }

  /**
   * Maneja errores de la transmisión según su tipo.
   */
  private async manejarError(
    error: unknown,
    params: TransmisionParams,
    correlationId: string,
  ): Promise<TransmisionResult> {
    // Req 11.5: Token expirado → invalidar cache, re-handshake, reintentar una vez
    if (error instanceof TokenExpiredError) {
      return this.reintentarConNuevoToken(params, correlationId);
    }

    // Req 11.4: Error transitorio → encolar en BullMQ
    if (error instanceof TransientError) {
      return this.encolarReintento(params, correlationId, error.message);
    }

    // Circuit Breaker abierto (HttpException 503) → encolar en BullMQ
    if (error instanceof HttpException && error.getStatus() === HttpStatus.SERVICE_UNAVAILABLE) {
      return this.encolarReintento(params, correlationId, 'Circuit breaker abierto');
    }

    // Cualquier otro error → propagar
    this.logger.error(
      `Error inesperado en transmisión: ${error instanceof Error ? error.message : String(error)}, correlationId=${correlationId}`,
    );
    throw error;
  }

  /**
   * Invalida el token cacheado en Redis, realiza un nuevo handshake y reintenta la transmisión.
   * Si el segundo intento también falla con 401, propaga el error.
   *
   * @see Requisito 11.5
   */
  private async reintentarConNuevoToken(
    params: TransmisionParams,
    correlationId: string,
  ): Promise<TransmisionResult> {
    this.logger.warn(
      `Token expirado, invalidando cache y reintentando: empresa=${params.empresa_id}, correlationId=${correlationId}`,
    );

    // Invalidar token en Redis
    const cacheKey = `${REDIS_KEY_PREFIX}${params.empresa_id}`;
    try {
      await this.redis.del(cacheKey);
    } catch (redisError: unknown) {
      const message = redisError instanceof Error ? redisError.message : 'Unknown error';
      this.logger.warn(`No se pudo invalidar token en Redis: ${message}`);
    }

    // Reintentar una vez con nuevo token
    try {
      return await this.ejecutarTransmision(params, correlationId, true);
    } catch (retryError: unknown) {
      // Si el reintento también da 401, propagar como error
      if (retryError instanceof TokenExpiredError) {
        this.logger.error(
          `Re-handshake falló: DGII sigue devolviendo 401, correlationId=${correlationId}`,
        );
        throw new HttpException(
          {
            statusCode: HttpStatus.UNAUTHORIZED,
            message: 'No se pudo autenticar con la DGII después del re-handshake',
            error: 'Unauthorized',
          },
          HttpStatus.UNAUTHORIZED,
        );
      }

      // Otros errores en el reintento se manejan normalmente
      return this.manejarError(retryError, params, correlationId);
    }
  }

  /**
   * Encola la transmisión en la cola de reintentos (BullMQ) si el servicio está disponible.
   * Si no hay RetryQueueService inyectado, propaga el error.
   *
   * @see Requisito 11.4
   */
  private async encolarReintento(
    params: TransmisionParams,
    correlationId: string,
    motivo: string,
  ): Promise<TransmisionResult> {
    this.logger.warn(
      `Encolando transmisión para reintento: factura=${params.factura_id}, motivo=${motivo}, correlationId=${correlationId}`,
    );

    if (!this.retryQueue) {
      this.logger.error(
        `No hay RetryQueueService disponible para encolar transmisión: factura=${params.factura_id}`,
      );
      throw new HttpException(
        {
          statusCode: HttpStatus.SERVICE_UNAVAILABLE,
          message: `Transmisión fallida y no se puede encolar: ${motivo}`,
          error: 'Service Unavailable',
        },
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }

    await this.retryQueue.encolarTransmision({
      factura_id: params.factura_id,
      empresa_id: params.empresa_id,
      xml_firmado: params.xml_firmado,
      correlation_id: correlationId,
      intento: 1,
    });

    return {
      track_id: null,
      estado: 'reintentando',
    };
  }
}

/**
 * Error interno que señala un token expirado (401 de DGII).
 */
class TokenExpiredError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TokenExpiredError';
  }
}

/**
 * Error interno que señala un error transitorio (5xx, timeout, red).
 */
class TransientError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TransientError';
  }
}
