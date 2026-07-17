import { Injectable, Inject, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import type Redis from 'ioredis';
import { REDIS_CLIENT } from '../common/guards/rate-limit.guard.js';
import type { IStorageProvider } from '../infrastructure/storage/storage.interface.js';
import { STORAGE_PROVIDER } from '../infrastructure/storage/storage.interface.js';

export type DependencyStatus = 'up' | 'down';
export type OverallStatus = 'up' | 'degraded' | 'down';

export interface DependencyCheckResult {
  status: DependencyStatus;
  latency_ms: number;
}

export interface HealthCheckResult {
  status: OverallStatus;
  timestamp: string;
  dependencies: {
    postgresql: DependencyCheckResult;
    redis: DependencyCheckResult;
    minio: DependencyCheckResult;
  };
}

export interface DgiiHealthCheckResult {
  status: DependencyStatus;
  timestamp: string;
  latency_ms: number;
  endpoint: string;
}

const DEP_TIMEOUT_MS = 5_000;
const DGII_TIMEOUT_MS = 10_000;

@Injectable()
export class HealthService {
  private readonly logger = new Logger(HealthService.name);
  private readonly dgiiSemillaUrl: string;

  constructor(
    private readonly dataSource: DataSource,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    @Inject(STORAGE_PROVIDER) private readonly storageProvider: IStorageProvider,
    private readonly configService: ConfigService,
  ) {
    this.dgiiSemillaUrl = this.configService.get<string>(
      'DGII_SEMILLA_URL',
      'https://ecf.dgii.gov.do/CerteCF/WSCertificacion/CertECF.asmx',
    );
  }

  async checkHealth(): Promise<HealthCheckResult> {
    const [postgresql, redis, minio] = await Promise.all([
      this.checkPostgresql(),
      this.checkRedis(),
      this.checkMinio(),
    ]);

    const status = this.computeOverallStatus(postgresql, redis, minio);

    return {
      status,
      timestamp: new Date().toISOString(),
      dependencies: { postgresql, redis, minio },
    };
  }

  async checkDgii(): Promise<DgiiHealthCheckResult> {
    const start = Date.now();
    let status: DependencyStatus = 'down';

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), DGII_TIMEOUT_MS);

      const response = await fetch(this.dgiiSemillaUrl, {
        method: 'HEAD',
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      status = response.ok || response.status < 500 ? 'up' : 'down';
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.logger.warn(`DGII health check failed: ${message}`);
      status = 'down';
    }

    return {
      status,
      timestamp: new Date().toISOString(),
      latency_ms: Date.now() - start,
      endpoint: this.dgiiSemillaUrl,
    };
  }

  private computeOverallStatus(
    postgresql: DependencyCheckResult,
    redis: DependencyCheckResult,
    minio: DependencyCheckResult,
  ): OverallStatus {
    if (postgresql.status === 'down' || redis.status === 'down') {
      return 'down';
    }
    if (minio.status === 'down') {
      return 'degraded';
    }
    return 'up';
  }

  private async checkPostgresql(): Promise<DependencyCheckResult> {
    const start = Date.now();
    try {
      await this.withTimeout(
        this.dataSource.query('SELECT 1'),
        DEP_TIMEOUT_MS,
      );
      return { status: 'up', latency_ms: Date.now() - start };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.logger.warn(`PostgreSQL health check failed: ${message}`);
      return { status: 'down', latency_ms: Date.now() - start };
    }
  }

  private async checkRedis(): Promise<DependencyCheckResult> {
    const start = Date.now();
    try {
      await this.withTimeout(this.redis.ping(), DEP_TIMEOUT_MS);
      return { status: 'up', latency_ms: Date.now() - start };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.logger.warn(`Redis health check failed: ${message}`);
      return { status: 'down', latency_ms: Date.now() - start };
    }
  }

  private async checkMinio(): Promise<DependencyCheckResult> {
    const start = Date.now();
    try {
      const bucket = this.configService.get<string>(
        'MINIO_BUCKET_XML',
        'encf-xml',
      );
      // Use a HEAD-like operation: try to download a non-existent key.
      // If the provider connects successfully, even a "not found" means MinIO is up.
      // We catch specific "not found" errors as a successful connectivity check.
      await this.withTimeout(
        this.storageProvider.download(bucket, '__health_check_probe__').then(
          () => true,
          (err: Error) => {
            // If the error is about the object not existing, MinIO is up
            if (
              err.message?.includes('NoSuchKey') ||
              err.message?.includes('not found') ||
              err.message?.includes('NotFound') ||
              err.message?.includes('The specified key does not exist')
            ) {
              return true;
            }
            throw err;
          },
        ),
        DEP_TIMEOUT_MS,
      );
      return { status: 'up', latency_ms: Date.now() - start };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.logger.warn(`MinIO health check failed: ${message}`);
      return { status: 'down', latency_ms: Date.now() - start };
    }
  }

  private withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Health check timed out after ${ms}ms`));
      }, ms);

      promise
        .then((result) => {
          clearTimeout(timer);
          resolve(result);
        })
        .catch((err) => {
          clearTimeout(timer);
          reject(err);
        });
    });
  }
}
