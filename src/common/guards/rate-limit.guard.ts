import {
  Injectable,
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Inject,
  Logger,
} from '@nestjs/common';
import type Redis from 'ioredis';

import type { RequestContext } from '../interfaces/request-context.interface.js';

export const REDIS_CLIENT = Symbol('REDIS_CLIENT');

export interface RateLimitConfig {
  /** Max requests per window for human users */
  userLimit: number;
  /** Max requests per window for API keys */
  apiKeyLimit: number;
  /** Window size in seconds */
  windowSeconds: number;
}

const DEFAULT_CONFIG: RateLimitConfig = {
  userLimit: 100,
  apiKeyLimit: 1000,
  windowSeconds: 60,
};

/**
 * Factor de reducción del límite cuando se opera en modo degradado (Redis caído).
 * Se aplica un límite en memoria más conservador como red de seguridad, en lugar
 * de dejar pasar todo el tráfico sin control (fail-open) o bloquearlo por completo.
 */
const DEGRADED_LIMIT_FACTOR = 0.5;

interface InMemoryBucket {
  count: number;
  resetAt: number;
}

@Injectable()
export class RateLimitGuard implements CanActivate {
  private readonly logger = new Logger(RateLimitGuard.name);
  private readonly config: RateLimitConfig;

  /**
   * Contadores en memoria (por proceso) usados solo como respaldo cuando Redis
   * no está disponible. No es un límite distribuido, pero evita el fail-open total.
   */
  private readonly memoryBuckets = new Map<string, InMemoryBucket>();

  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {
    this.config = DEFAULT_CONFIG;
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const response = context.switchToHttp().getResponse();
    const user = request.user as RequestContext | undefined;

    if (!user) {
      // No authenticated user - skip rate limiting (auth guard should handle this)
      return true;
    }

    const { key, limit } = this.getKeyAndLimit(user);
    const now = Date.now();
    const windowStart = now - this.config.windowSeconds * 1000;

    try {
      const requestCount = await this.slidingWindowCheck(key, now, windowStart);

      if (requestCount >= limit) {
        const retryAfter = await this.calculateRetryAfter(key, windowStart);
        response.setHeader('Retry-After', String(retryAfter));
        throw new HttpException(
          {
            statusCode: HttpStatus.TOO_MANY_REQUESTS,
            message: 'Demasiadas solicitudes. Por favor, intente de nuevo más tarde.',
            error: 'Too Many Requests',
          },
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }

      // Record this request
      await this.recordRequest(key, now, windowStart);
      return true;
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      // Redis no disponible: degradación controlada (fail-closed suave).
      // En lugar de permitir todo el tráfico sin límite, se aplica un límite en
      // memoria por proceso, más conservador, como red de seguridad.
      this.logger.warn(
        `Rate limit (Redis) falló para ${key}: ${(error as Error).message}. Aplicando límite en memoria degradado.`,
      );
      return this.inMemoryFallback(key, limit, now, response);
    }
  }

  /**
   * Limitador en memoria de respaldo (ventana fija por proceso) que se usa cuando
   * Redis está caído. Aplica un límite reducido para contener abuso sin tumbar el
   * servicio. No es distribuido: cada instancia cuenta por separado.
   */
  private inMemoryFallback(
    key: string,
    limit: number,
    now: number,
    response: { setHeader: (n: string, v: string) => void },
  ): boolean {
    const degradedLimit = Math.max(1, Math.floor(limit * DEGRADED_LIMIT_FACTOR));
    const windowMs = this.config.windowSeconds * 1000;

    const bucket = this.memoryBuckets.get(key);
    if (!bucket || bucket.resetAt <= now) {
      this.memoryBuckets.set(key, { count: 1, resetAt: now + windowMs });
      return true;
    }

    if (bucket.count >= degradedLimit) {
      const retryAfter = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
      response.setHeader('Retry-After', String(retryAfter));
      throw new HttpException(
        {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          message: 'Demasiadas solicitudes (modo degradado). Intente de nuevo más tarde.',
          error: 'Too Many Requests',
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    bucket.count += 1;
    // Limpieza oportunista para evitar crecimiento no acotado del Map.
    if (this.memoryBuckets.size > 10_000) {
      for (const [k, b] of this.memoryBuckets) {
        if (b.resetAt <= now) this.memoryBuckets.delete(k);
      }
    }
    return true;
  }

  private getKeyAndLimit(user: RequestContext): { key: string; limit: number } {
    if (user.tipo === 'api_key' && user.api_key_id) {
      return {
        key: `rate_limit:apikey:${user.api_key_id}`,
        limit: this.config.apiKeyLimit,
      };
    }
    return {
      key: `rate_limit:user:${user.usuario_id ?? user.empresa_id}`,
      limit: this.config.userLimit,
    };
  }

  /**
   * Sliding window rate limit using Redis sorted sets.
   * - Members are timestamps (score = timestamp in ms)
   * - Remove expired entries, then count remaining
   */
  private async slidingWindowCheck(
    key: string,
    _now: number,
    windowStart: number,
  ): Promise<number> {
    // Remove expired entries and count current ones in a pipeline
    const pipeline = this.redis.pipeline();
    pipeline.zremrangebyscore(key, 0, windowStart);
    pipeline.zcard(key);
    const results = await pipeline.exec();

    if (!results || results.length < 2) {
      return 0;
    }

    const [, countResult] = results[1] as [Error | null, number];
    return countResult ?? 0;
  }

  private async recordRequest(key: string, now: number, windowStart: number): Promise<void> {
    const pipeline = this.redis.pipeline();
    // Add the current request timestamp as both score and member
    // Use a unique member to avoid collisions: timestamp + random suffix
    const member = `${now}:${Math.random().toString(36).slice(2, 8)}`;
    pipeline.zadd(key, now, member);
    // Clean up old entries
    pipeline.zremrangebyscore(key, 0, windowStart);
    // Set TTL to auto-expire the key after the window passes
    pipeline.expire(key, this.config.windowSeconds + 1);
    await pipeline.exec();
  }

  private async calculateRetryAfter(key: string, windowStart: number): Promise<number> {
    // Get the oldest entry in the current window
    const oldest = await this.redis.zrangebyscore(key, windowStart, '+inf', 'LIMIT', 0, 1);

    if (!oldest || oldest.length === 0) {
      return this.config.windowSeconds;
    }

    // The member format is "timestamp:random", extract the timestamp
    const oldestTimestamp = parseInt(oldest[0].split(':')[0], 10);
    const expiresAt = oldestTimestamp + this.config.windowSeconds * 1000;
    const retryAfterMs = expiresAt - Date.now();

    return Math.max(1, Math.ceil(retryAfterMs / 1000));
  }
}
