import {
  Injectable,
  Logger,
  ServiceUnavailableException,
  UnauthorizedException,
  Inject,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type Redis from 'ioredis';

import { SemillaService } from './semilla.service.js';
import { FirmaService } from './firma.service.js';
import { REDIS_CLIENT } from '../common/guards/rate-limit.guard.js';
import { getCorrelationId } from '../common/interceptors/correlation-id.interceptor.js';

const TIMEOUT_MS = 10_000;
const TOKEN_TTL_SECONDS = 3540; // 59 minutos (compensa clock skew)
const REDIS_KEY_PREFIX = 'dgii_token:';

/**
 * Interfaz del servicio de token DGII.
 * @see Requisitos 7.1, 7.2, 7.3, 7.4, 7.5, 7.6
 */
export interface IDgiiTokenService {
  obtenerToken(empresaId: string, ambiente?: string): Promise<string>;
}

/**
 * Extrae el token de la respuesta del endpoint de autenticación de la DGII.
 * La DGII responde con JSON: { token: "...", expira: "...", expedido: "..." }.
 * Como respaldo, si la respuesta viniera como XML, se intenta por regex.
 */
function extractTokenFromResponse(responseBody: string): string | null {
  // Intentar JSON primero (formato REST oficial de la DGII)
  try {
    const parsed = JSON.parse(responseBody) as Record<string, unknown>;
    const token =
      (parsed['token'] as string) ??
      (parsed['Token'] as string) ??
      (parsed['access_token'] as string);
    if (token) {
      return String(token).trim();
    }
  } catch {
    // No era JSON: continuar con el respaldo XML
  }

  const tokenMatch = responseBody.match(
    /<(?:[a-zA-Z_][\w.-]*:)?[Tt]oken[^>]*>([\s\S]*?)<\/(?:[a-zA-Z_][\w.-]*:)?[Tt]oken>/,
  );
  if (tokenMatch && tokenMatch[1]) {
    return tokenMatch[1].trim();
  }

  return null;
}

/**
 * Servicio de obtención y cache de token Bearer de la DGII.
 *
 * Flujo:
 * 1. Buscar en Redis: dgii_token:{empresa_id}
 * 2. Si existe -> retornar token cacheado
 * 3. Si no: solicitar semilla SOAP (10s) -> firmar -> enviar firmada (10s)
 * 4. Almacenar token en Redis con TTL 3540s (59 min)
 * 5. Si Redis inalcanzable -> handshake sin cache (log WARNING)
 *
 * @see Requisitos 7.1, 7.2, 7.3, 7.4, 7.5, 7.6
 */
@Injectable()
export class DgiiTokenService implements IDgiiTokenService {
  private readonly logger = new Logger(DgiiTokenService.name);
  private readonly tokenUrl: string;

  constructor(
    private readonly semillaService: SemillaService,
    private readonly firmaService: FirmaService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly configService: ConfigService,
  ) {
    this.tokenUrl = this.configService.get<string>(
      'DGII_TOKEN_URL',
      'https://ecf.dgii.gov.do/CerteCF/autenticacion/api/Autenticacion/ValidarSemilla',
    );
  }

  /**
   * Returns the DGII token URL based on the ambiente.
   * En producción se usa el segmento de ruta "eCF" en lugar de "CerteCF".
   */
  private getDgiiTokenUrl(ambiente?: string): string {
    if (ambiente === 'produccion') {
      return this.tokenUrl.replace('/CerteCF/', '/eCF/');
    }
    return this.tokenUrl;
  }

  /**
   * Obtiene un Bearer Token de la DGII para la empresa indicada.
   * Reutiliza token cacheado en Redis si está disponible.
   *
   * @param empresaId - ID de la empresa
   * @param ambiente - Ambiente DGII de la empresa
   * @returns Bearer Token válido
   * @throws UnauthorizedException (401) si DGII rechaza la semilla firmada
   * @throws ServiceUnavailableException (503) si el endpoint DGII es inalcanzable o timeout
   */
  async obtenerToken(empresaId: string, ambiente?: string): Promise<string> {
    const correlationId = getCorrelationId() ?? 'no-correlation';
    const cacheKey = `${REDIS_KEY_PREFIX}${empresaId}`;

    // Req 7.3: Reutilizar token cacheado si disponible
    const cachedToken = await this.getCachedToken(cacheKey, correlationId);
    if (cachedToken) {
      this.logger.debug(
        `Token cacheado encontrado para empresa ${empresaId}`,
        `correlationId=${correlationId}`,
      );
      return cachedToken;
    }

    // Handshake completo: semilla -> firma -> token
    const token = await this.executeHandshake(empresaId, correlationId, ambiente);

    // Req 7.2: Almacenar token en Redis con TTL 3540s
    await this.cacheToken(cacheKey, token, correlationId);

    return token;
  }

  /**
   * Intenta obtener el token del cache Redis.
   * Si Redis es inalcanzable, retorna null y loguea WARNING.
   * @see Requisito 7.6
   */
  private async getCachedToken(
    cacheKey: string,
    correlationId: string,
  ): Promise<string | null> {
    try {
      const token = await this.redis.get(cacheKey);
      return token;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.logger.warn(
        `Redis inalcanzable al leer cache de token: ${message}. Procediendo con handshake sin cache.`,
        `correlationId=${correlationId}`,
      );
      return null;
    }
  }

  /**
   * Almacena el token en Redis con TTL 3540s.
   * Si Redis es inalcanzable, loguea WARNING y continúa.
   * @see Requisitos 7.2, 7.6
   */
  private async cacheToken(
    cacheKey: string,
    token: string,
    correlationId: string,
  ): Promise<void> {
    try {
      await this.redis.set(cacheKey, token, 'EX', TOKEN_TTL_SECONDS);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.logger.warn(
        `Redis inalcanzable al almacenar token: ${message}. Token no será cacheado.`,
        `correlationId=${correlationId}`,
      );
    }
  }

  /**
   * Ejecuta el handshake completo con DGII:
   * 1. Solicitar semilla SOAP
   * 2. Firmar semilla con XAdES-BES
   * 3. Enviar semilla firmada al endpoint de token
   *
   * @see Requisitos 7.1, 7.4, 7.5
   */
  private async executeHandshake(
    empresaId: string,
    correlationId: string,
    ambiente?: string,
  ): Promise<string> {
    // Paso 1: Solicitar semilla (ya tiene timeout 10s interno)
    const semillaXml = await this.semillaService.solicitarSemilla(ambiente);

    // Paso 2: Firmar semilla con certificado de la empresa
    const semillaFirmada = await this.firmaService.firmarSemilla(
      semillaXml,
      empresaId,
    );

    // Paso 3: Enviar semilla firmada al endpoint de token DGII
    const token = await this.enviarSemillaFirmada(
      semillaFirmada,
      correlationId,
      ambiente,
    );

    return token;
  }

  /**
   * Envía la semilla firmada al endpoint de token DGII via SOAP.
   * Timeout: 10s.
   *
   * @see Requisito 7.1: Enviar semilla firmada, recibir Bearer Token
   * @see Requisito 7.4: Si DGII rechaza, log + 401
   * @see Requisito 7.5: Si inalcanzable/timeout, log + 503
   */
  private async enviarSemillaFirmada(
    semillaFirmadaXml: string,
    correlationId: string,
    ambiente?: string,
  ): Promise<string> {
    const tokenUrl = this.getDgiiTokenUrl(ambiente);

    // La DGII espera la semilla firmada como multipart/form-data en el campo "xml"
    // (un archivo XML), no como cuerpo XML plano ni SOAP.
    const formData = new FormData();
    const blob = new Blob([semillaFirmadaXml], { type: 'application/xml' });
    formData.append('xml', blob, 'signed.xml');

    let response: Response;
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

      response = await fetch(tokenUrl, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          // No fijar Content-Type manualmente: fetch añade el boundary del multipart.
        },
        body: formData,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(
        `Error contactando endpoint de token DGII: ${message}`,
        undefined,
        `correlationId=${correlationId}`,
      );
      throw new ServiceUnavailableException(
        `No se pudo contactar al servicio de token DGII: ${message}`,
      );
    }

    // Req 7.4: Si DGII rechaza la semilla firmada (HTTP 401 o similar)
    if (response.status === 401 || response.status === 403) {
      const body = await response.text();
      this.logger.error(
        `DGII rechazó la semilla firmada: HTTP ${response.status} - ${body}`,
        undefined,
        `correlationId=${correlationId}`,
      );
      throw new UnauthorizedException(
        `La DGII rechazó la semilla firmada: HTTP ${response.status}`,
      );
    }

    // Req 7.5: Respuesta HTTP no exitosa (distinta a rechazo explícito)
    if (!response.ok) {
      this.logger.error(
        `Endpoint de token DGII respondió con HTTP ${response.status}`,
        undefined,
        `correlationId=${correlationId}`,
      );
      throw new ServiceUnavailableException(
        `El servicio de token DGII respondió con estado HTTP ${response.status}`,
      );
    }

    const responseBody = await response.text();
    const token = extractTokenFromResponse(responseBody);

    if (!token) {
      this.logger.error(
        `No se pudo extraer el token de la respuesta DGII`,
        undefined,
        `correlationId=${correlationId}`,
      );
      throw new ServiceUnavailableException(
        'La respuesta de la DGII no contiene un token válido',
      );
    }

    return token;
  }
}
