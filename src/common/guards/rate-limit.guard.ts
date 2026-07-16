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

@Injectable()
export class RateLimitGuard implements CanActivate {
  private readonly logger = new Logger(RateLimitGuard.name);
  private readonly config: RateLimitConfig;

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
      // If Redis is unavailable, allow the request (graceful degradation)
      this.logger.warn(
        `Rate limit check failed for key ${key}: ${(error as Error).message}. Allowing request.`,
      );
      return true;
    }
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
