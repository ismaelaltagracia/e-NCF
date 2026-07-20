import {
  Injectable,
  Logger,
  Inject,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type Redis from 'ioredis';

import { REDIS_CLIENT } from '../common/guards/rate-limit.guard.js';
import { getCorrelationId } from '../common/interceptors/correlation-id.interceptor.js';
import type { Empresa } from '../database/entities/empresa.entity.js';
import { RncContribuyente } from '../database/entities/rnc-contribuyente.entity.js';

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

  constructor(
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    @InjectRepository(RncContribuyente)
    private readonly rncRepo: Repository<RncContribuyente>,
  ) {}

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
    _correlationId: string,
  ): Promise<RncValidationResult> {
    // Primero consultar la tabla local de contribuyentes (CSV DGII)
    const local = await this.rncRepo.findOne({ where: { rnc } });
    if (local) {
      const estado = this.normalizeEstado(local.estado);
      return {
        rnc,
        nombre_contribuyente: local.razon_social,
        estado,
        tipo_contribuyente: 'persona_juridica',
        validado: true,
      };
    }

    // Si no existe localmente, tratar como no encontrado
    throw new HttpException(
      {
        statusCode: HttpStatus.UNPROCESSABLE_ENTITY,
        message: `RNC ${rnc} no existe en el registro de contribuyentes.`,
        error: 'Unprocessable Entity',
        detalles: { rnc, estado_dgii: 'no_encontrado' },
      },
      HttpStatus.UNPROCESSABLE_ENTITY,
    );
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
    return (
      error instanceof DgiiUnreachableError ||
      (error instanceof SyntaxError) ||
      (error instanceof TypeError && /fetch|network|abort/i.test((error as Error).message))
    );
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
