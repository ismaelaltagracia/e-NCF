import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { HealthService } from './health.service';
import { REDIS_CLIENT } from '../common/guards/rate-limit.guard';
import { STORAGE_PROVIDER } from '../infrastructure/storage/storage.interface';

describe('HealthService', () => {
  let service: HealthService;
  let mockDataSource: { query: jest.Mock };
  let mockRedis: { ping: jest.Mock };
  let mockStorageProvider: { download: jest.Mock };
  let mockConfigService: { get: jest.Mock };

  beforeEach(async () => {
    mockDataSource = { query: jest.fn() };
    mockRedis = { ping: jest.fn() };
    mockStorageProvider = { download: jest.fn() };
    mockConfigService = {
      get: jest.fn((key: string, defaultValue?: string) => {
        const config: Record<string, string> = {
          DGII_SEMILLA_URL: 'https://ecf.dgii.gov.do/test',
          MINIO_BUCKET_XML: 'encf-xml',
        };
        return config[key] ?? defaultValue;
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        HealthService,
        { provide: DataSource, useValue: mockDataSource },
        { provide: REDIS_CLIENT, useValue: mockRedis },
        { provide: STORAGE_PROVIDER, useValue: mockStorageProvider },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    service = module.get<HealthService>(HealthService);
  });

  describe('checkHealth', () => {
    it('should return "up" when all dependencies are healthy', async () => {
      mockDataSource.query.mockResolvedValue([{ '?column?': 1 }]);
      mockRedis.ping.mockResolvedValue('PONG');
      mockStorageProvider.download.mockRejectedValue(
        new Error('NoSuchKey: Key not found'),
      );

      const result = await service.checkHealth();

      expect(result.status).toBe('up');
      expect(result.dependencies.postgresql.status).toBe('up');
      expect(result.dependencies.redis.status).toBe('up');
      expect(result.dependencies.minio.status).toBe('up');
      expect(result.timestamp).toBeDefined();
      expect(typeof result.dependencies.postgresql.latency_ms).toBe('number');
      expect(typeof result.dependencies.redis.latency_ms).toBe('number');
      expect(typeof result.dependencies.minio.latency_ms).toBe('number');
    });

    it('should return "degraded" when only MinIO is down', async () => {
      mockDataSource.query.mockResolvedValue([{ '?column?': 1 }]);
      mockRedis.ping.mockResolvedValue('PONG');
      mockStorageProvider.download.mockRejectedValue(
        new Error('Connection refused'),
      );

      const result = await service.checkHealth();

      expect(result.status).toBe('degraded');
      expect(result.dependencies.postgresql.status).toBe('up');
      expect(result.dependencies.redis.status).toBe('up');
      expect(result.dependencies.minio.status).toBe('down');
    });

    it('should return "down" when PostgreSQL is down', async () => {
      mockDataSource.query.mockRejectedValue(new Error('Connection refused'));
      mockRedis.ping.mockResolvedValue('PONG');
      mockStorageProvider.download.mockRejectedValue(
        new Error('NoSuchKey: Key not found'),
      );

      const result = await service.checkHealth();

      expect(result.status).toBe('down');
      expect(result.dependencies.postgresql.status).toBe('down');
    });

    it('should return "down" when Redis is down', async () => {
      mockDataSource.query.mockResolvedValue([{ '?column?': 1 }]);
      mockRedis.ping.mockRejectedValue(new Error('Connection refused'));
      mockStorageProvider.download.mockRejectedValue(
        new Error('NoSuchKey: Key not found'),
      );

      const result = await service.checkHealth();

      expect(result.status).toBe('down');
      expect(result.dependencies.redis.status).toBe('down');
    });

    it('should return "down" when both PostgreSQL and Redis are down', async () => {
      mockDataSource.query.mockRejectedValue(new Error('timeout'));
      mockRedis.ping.mockRejectedValue(new Error('timeout'));
      mockStorageProvider.download.mockRejectedValue(new Error('timeout'));

      const result = await service.checkHealth();

      expect(result.status).toBe('down');
      expect(result.dependencies.postgresql.status).toBe('down');
      expect(result.dependencies.redis.status).toBe('down');
      expect(result.dependencies.minio.status).toBe('down');
    });

    it('should handle PostgreSQL timeout', async () => {
      mockDataSource.query.mockImplementation(
        () => new Promise((resolve) => setTimeout(resolve, 10_000)),
      );
      mockRedis.ping.mockResolvedValue('PONG');
      mockStorageProvider.download.mockRejectedValue(
        new Error('NoSuchKey: Key not found'),
      );

      // Override timeout for test speed - the service uses 5s, but we just test the timeout mechanism
      const result = await service.checkHealth();

      expect(result.dependencies.postgresql.status).toBe('down');
    }, 10_000);

    it('should measure latency for each dependency', async () => {
      mockDataSource.query.mockImplementation(
        () => new Promise((resolve) => setTimeout(() => resolve([]), 50)),
      );
      mockRedis.ping.mockImplementation(
        () => new Promise((resolve) => setTimeout(() => resolve('PONG'), 30)),
      );
      mockStorageProvider.download.mockImplementation(
        () =>
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error('NoSuchKey')), 20),
          ),
      );

      const result = await service.checkHealth();

      expect(result.dependencies.postgresql.latency_ms).toBeGreaterThanOrEqual(40);
      expect(result.dependencies.redis.latency_ms).toBeGreaterThanOrEqual(20);
      expect(result.dependencies.minio.latency_ms).toBeGreaterThanOrEqual(10);
    });
  });

  describe('checkDgii', () => {
    let originalFetch: typeof globalThis.fetch;

    beforeEach(() => {
      originalFetch = globalThis.fetch;
    });

    afterEach(() => {
      globalThis.fetch = originalFetch;
    });

    it('should return "up" when DGII endpoint responds successfully', async () => {
      globalThis.fetch = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
      });

      const result = await service.checkDgii();

      expect(result.status).toBe('up');
      expect(result.endpoint).toBe('https://ecf.dgii.gov.do/test');
      expect(typeof result.latency_ms).toBe('number');
      expect(result.timestamp).toBeDefined();
    });

    it('should return "up" when DGII returns 4xx (service reachable)', async () => {
      globalThis.fetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 405,
      });

      const result = await service.checkDgii();

      expect(result.status).toBe('up');
    });

    it('should return "down" when DGII returns 5xx', async () => {
      globalThis.fetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 500,
      });

      const result = await service.checkDgii();

      expect(result.status).toBe('down');
    });

    it('should return "down" when fetch fails (network error)', async () => {
      globalThis.fetch = jest
        .fn()
        .mockRejectedValue(new Error('Network unreachable'));

      const result = await service.checkDgii();

      expect(result.status).toBe('down');
      expect(typeof result.latency_ms).toBe('number');
    });

    it('should return "down" when fetch times out', async () => {
      globalThis.fetch = jest.fn().mockImplementation(
        () =>
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error('aborted')), 100),
          ),
      );

      const result = await service.checkDgii();

      expect(result.status).toBe('down');
    });
  });
});
