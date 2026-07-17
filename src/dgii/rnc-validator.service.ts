import {
  Injectable,
  Logger,
  Inject,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type Redis from 'ioredis';

import { REDIS_CLIENT } from '../common/guards/rate-limit.guard.js';
import { getCorrelationId } from '../common/interceptors/correlation-id.interceptor.js';
import type { Empresa } from '../database/entities/empresa.entity.js';

const DGII_RNC_TIMEOUT_MS = 5_000;
const RNC_CACHE_TTL_SECONDS = 86_400; // 24 horas
const RNC_CACHE_PREFIX = 'rnc_cache:';

/**
 * Resultado de la validación de un RNC contra la DGII.
 */
export interface RncValidationResult {
  rnc: string;
  nombre_contribuyente: string;
  estado: 'activo' | 'inactivo' | 'suspendido';
  tipo_contribuyente: string;
  validado: boolean;
}

/**
 * Resultado parcial cuando la DGII no es alcanzable.
 */
export interface RncValidationSkipped {
  rnc: string;
  validado: false;
  motivo: string;
}

/**
 * Servicio de validación de RNC receptor contra el registro de la DGII.
 *
 * Funcionalidades:
 * - Consulta el servicio DGII de RNC con timeout de 5s
 * - Cachea RNCs validados en Redis con TTL de 24h
 * - Si DGII inalcanzable: procede sin validación (flag rnc_validado=false)
 * - Flag configurable por empresa (validar_rnc_receptor)
 *
 * @see Requisitos 33.1, 33.2, 33.3, 33.4, 33.5, 33.6
 */
@Injectable()
export class RncValidatorService {
  private readonly logger = new Logger(RncValidatorService.name);
  private readonly dgiiRncUrl: string;

  constructor(
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly configService: ConfigService,
  ) {
    this.dgiiRncUrl = this.configService.get<string>(
      'DGII_RNC_URL',
      'https://dgii.gov.do/app/WebApps/ConsultasWeb2/ConsultasWeb/consultas/rnc.aspx',
    );
  }

  /**
   * Valida un RNC contra el servicio de la DGII.
   * Primero consulta cache Redis, luego llama a DGII si no está cacheado.
   *
   * @param rnc - RNC a validar (9 u 11 dígitos)
   * @returns Resultado de validación o resultado parcial si DGII inalcanzable
   * @throws HttpException 422 si el RNC es inválido o inactivo
   *
   * @see Requisitos 33.1, 33.3, 33.4
   */
  async validarRnc(rnc: string): Promise<RncValidationResult | RncValidationSkipped> {
    const correlationId = getCorrelationId() ?? 'no-correlation';
    const cacheKey = `${RNC_CACHE_PREFIX}${rnc}`;

    // Req 33.3: Verificar cache Redis primero
    const cached = await this.getCachedRnc(cacheKey, correlationId);
    if (cached) {
      this.logger.debug(
        `RNC ${rnc} encontrado en cache`,
        `correlationId=${correlationId}`,
      );
      return cached;
    }

    // Consultar servicio DGII
    let result: RncValidationResult;
    try {
      result = await this.consultarDgii(rnc, correlationId);
    } catch (error: unknown) {
      // Req 33.4: Si DGII inalcanzable, proceder sin validación
      if (this.isDgiiUnreachableError(error)) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        this.logger.warn(
          `DGII RNC service inalcanzable para RNC ${rnc}: ${message}. Procediendo sin validación.`,
          `correlationId=${correlationId}`,
        );
        return {
          rnc,
          validado: false,
          motivo: `Servicio DGII inalcanzable: ${message}`,
        };
      }
      throw error;
    }

    // Req 33.3: Cachear resultado exitoso con TTL 24h
    await this.cacheRnc(cacheKey, result, correlationId);

    return result;
  }

  /**
   * Valida el RNC receptor en el contexto de una factura.
   * Respeta el flag configurable validar_rnc_receptor de la empresa.
   *
   * @param rnc - RNC receptor a validar
   * @param empresa - Empresa que emite la factura
   * @returns { rnc_validado: boolean } indicando si la validación fue exitosa
   * @throws HttpException 422 si el RNC es inválido o inactivo
   *
   * @see Requisitos 33.1, 33.2, 33.4, 33.6
   */
  async validarRncParaFactura(
    rnc: string,
    empresa: Empresa,
  ): Promise<{ rnc_validado: boolean }> {
    const correlationId = getCorrelationId() ?? 'no-correlation';

    // Req 33.6: Flag configurable por empresa
    if (!empresa.validar_rnc_receptor) {
      this.logger.debug(
        `Validación RNC receptor deshabilitada para empresa ${empresa.id}`,
        `correlationId=${correlationId}`,
      );
      return { rnc_validado: false };
    }

    const result = await this.validarRnc(rnc);

    // Si DGII inalcanzable, retornar flag rnc_validado=false
    if (!result.validado) {
      return { rnc_validado: false };
    }

    // Req 33.2: Si RNC inactivo o no existe, lanzar 422
    const validResult = result as RncValidationResult;
    if (validResult.estado !== 'activo') {
      throw new HttpException(
        {
          statusCode: HttpStatus.UNPROCESSABLE_ENTITY,
          message: `RNC receptor ${rnc} tiene estado "${validResult.estado}" en la DGII. Solo se permiten RNC con estado activo.`,
          error: 'Unprocessable Entity',
          detalles: {
            rnc,
            estado_dgii: validResult.estado,
            nombre_contribuyente: validResult.nombre_contribuyente,
          },
        },
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    }

    return { rnc_validado: true };
  }

  /**
   * Consulta el servicio DGII para validar un RNC.
   * Timeout de 5 segundos.
   *
   * @see Requisito 33.1
   */
  private async consultarDgii(
    rnc: string,
    correlationId: string,
  ): Promise<RncValidationResult> {
    const url = `${this.dgiiRncUrl}?rnc=${encodeURIComponent(rnc)}`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), DGII_RNC_TIMEOUT_MS);

    let response: Response;
    try {
      response = await fetch(url, {
        method: 'GET',
        headers: {
          Accept: 'application/json',
          'X-Correlation-ID': correlationId,
        },
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
    } catch (error: unknown) {
      clearTimeout(timeoutId);
      const message = error instanceof Error ? error.message : 'Unknown error';
      throw new DgiiUnreachableError(
        `Error contactando servicio RNC DGII: ${message}`,
      );
    }

    if (!response.ok) {
      if (response.status === 404) {
        // RNC no encontrado en DGII
        throw new HttpException(
          {
            statusCode: HttpStatus.UNPROCESSABLE_ENTITY,
            message: `RNC ${rnc} no existe en el registro de la DGII.`,
            error: 'Unprocessable Entity',
            detalles: { rnc, estado_dgii: 'no_encontrado' },
          },
          HttpStatus.UNPROCESSABLE_ENTITY,
        );
      }

      // Error del servidor DGII -> tratar como inalcanzable
      throw new DgiiUnreachableError(
        `Servicio RNC DGII respondió con HTTP ${response.status}`,
      );
    }

    const data = await response.json() as Record<string, unknown>;

    return this.parseRncResponse(rnc, data);
  }

  /**
   * Parsea la respuesta del servicio RNC de la DGII.
   */
  private parseRncResponse(
    rnc: string,
    data: Record<string, unknown>,
  ): RncValidationResult {
    const nombre = (data.nombre_contribuyente ?? data.nombre ?? data.razon_social ?? '') as string;
    const estado = this.normalizeEstado(
      (data.estado ?? data.status ?? 'inactivo') as string,
    );
    const tipo = (data.tipo_contribuyente ?? data.tipo ?? 'persona_juridica') as string;

    return {
      rnc,
      nombre_contribuyente: nombre,
      estado,
      tipo_contribuyente: tipo,
      validado: true,
    };
  }

  /**
   * Normaliza el estado retornado por DGII a valores conocidos.
   */
  private normalizeEstado(estado: string): 'activo' | 'inactivo' | 'suspendido' {
    const normalized = estado.toLowerCase().trim();
    if (normalized === 'activo' || normalized === 'active') return 'activo';
    if (normalized === 'suspendido' || normalized === 'suspended') return 'suspendido';
    return 'inactivo';
  }

  /**
   * Obtiene un RNC cacheado desde Redis.
   * Si Redis inalcanzable, retorna null.
   */
  private async getCachedRnc(
    cacheKey: string,
    correlationId: string,
  ): Promise<RncValidationResult | null> {
    try {
      const cached = await this.redis.get(cacheKey);
      if (!cached) return null;
      return JSON.parse(cached) as RncValidationResult;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.logger.warn(
        `Redis inalcanzable al leer cache RNC: ${message}`,
        `correlationId=${correlationId}`,
      );
      return null;
    }
  }

  /**
   * Almacena un resultado de validación en Redis con TTL 24h.
   * Si Redis inalcanzable, loguea warning y continúa.
   *
   * @see Requisito 33.3
   */
  private async cacheRnc(
    cacheKey: string,
    result: RncValidationResult,
    correlationId: string,
  ): Promise<void> {
    try {
      await this.redis.set(cacheKey, JSON.stringify(result), 'EX', RNC_CACHE_TTL_SECONDS);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.logger.warn(
        `Redis inalcanzable al cachear RNC: ${message}. Resultado no cacheado.`,
        `correlationId=${correlationId}`,
      );
    }
  }

  /**
   * Determina si un error es por DGII inalcanzable (timeout o error de red).
   */
  private isDgiiUnreachableError(error: unknown): boolean {
    return error instanceof DgiiUnreachableError;
  }
}

/**
 * Error interno que indica que el servicio DGII es inalcanzable.
 */
class DgiiUnreachableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DgiiUnreachableError';
  }
}
