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
 * Construye el envelope SOAP para enviar la semilla firmada al endpoint de autenticación.
 */
function buildTokenSoapEnvelope(semillaFirmadaXml: string): string {
  return `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <AutenticacionInput xmlns="urn:dgii.gov.do:ecf:remision:2019">
      ${semillaFirmadaXml}
    </AutenticacionInput>
  </soap:Body>
</soap:Envelope>`;
}

/**
 * Extrae el token de la respuesta SOAP del endpoint de autenticación DGII.
 * Busca el contenido dentro del elemento de respuesta de autenticación.
 */
function extractTokenFromResponse(responseXml: string): string | null {
  // Buscar el token en la respuesta SOAP
  // Patrones comunes: <token>...</token> o <Token>...</Token>
  const tokenMatch = responseXml.match(
    /<(?:[a-zA-Z_][\w.-]*:)?[Tt]oken[^>]*>([\s\S]*?)<\/(?:[a-zA-Z_][\w.-]*:)?[Tt]oken>/,
  );
  if (tokenMatch && tokenMatch[1]) {
    return tokenMatch[1].trim();
  }

  // Alternativa: buscar en AutenticacionResult
  const resultMatch = responseXml.match(
    /<(?:[a-zA-Z_][\w.-]*:)?AutenticacionResult[^>]*>([\s\S]*?)<\/(?:[a-zA-Z_][\w.-]*:)?AutenticacionResult>/,
  );
  if (resultMatch && resultMatch[1]) {
    return resultMatch[1].trim();
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
      'https://ecf.dgii.gov.do/CerteCF/WSCertificacion.asmx',
    );
  }

  /**
   * Returns the DGII token URL based on the ambiente.
   */
  private getDgiiTokenUrl(ambiente?: string): string {
    if (ambiente === 'produccion') {
      return 'https://ecf.dgii.gov.do/ECF/WSCertificacion.asmx';
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
    const soapEnvelope = buildTokenSoapEnvelope(semillaFirmadaXml);
    const tokenUrl = this.getDgiiTokenUrl(ambiente);

    let response: Response;
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

      response = await fetch(tokenUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'text/xml; charset=utf-8',
          SOAPAction: '"urn:dgii.gov.do:ecf:remision:2019/GetToken"',
        },
        body: soapEnvelope,
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
