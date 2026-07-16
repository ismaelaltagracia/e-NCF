import { Module, Global, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

import { REDIS_CLIENT } from '../../common/guards/rate-limit.guard.js';

const logger = new Logger('RedisModule');

@Global()
@Module({
  providers: [
    {
      provide: REDIS_CLIENT,
      useFactory: (configService: ConfigService): Redis => {
        const host = configService.get<string>('REDIS_HOST', 'localhost');
        const port = configService.get<number>('REDIS_PORT', 6379);
        const password = configService.get<string>('REDIS_PASSWORD', '');

        const redis = new Redis({
          host,
          port,
          password: password || undefined,
          maxRetriesPerRequest: 3,
          retryStrategy(times: number): number | null {
            if (times > 3) {
              logger.warn('Redis connection failed after 3 retries');
              return null;
            }
            return Math.min(times * 200, 2000);
          },
          lazyConnect: true,
        });

        redis.on('error', (err: Error) => {
          logger.warn(`Redis connection error: ${err.message}`);
        });

        redis.on('connect', () => {
          logger.log('Redis connected successfully');
        });

        // Attempt connection but don't block app startup
        redis.connect().catch((err: Error) => {
          logger.warn(
            `Redis initial connection failed: ${err.message}. Rate limiting will be disabled.`,
          );
        });

        return redis;
      },
      inject: [ConfigService],
    },
  ],
  exports: [REDIS_CLIENT],
})
export class RedisModule {}
