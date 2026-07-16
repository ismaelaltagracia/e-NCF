import { ExecutionContext, HttpException, HttpStatus } from '@nestjs/common';
import { RateLimitGuard } from './rate-limit.guard.js';
import type { RequestContext } from '../interfaces/request-context.interface.js';

describe('RateLimitGuard', () => {
  let guard: RateLimitGuard;
  let mockRedis: Record<string, jest.Mock>;
  let mockRequest: { user?: RequestContext };
  let mockResponse: { setHeader: jest.Mock };

  const createMockContext = (): ExecutionContext =>
    ({
      switchToHttp: () => ({
        getRequest: () => mockRequest,
        getResponse: () => mockResponse,
      }),
    }) as unknown as ExecutionContext;

  beforeEach(() => {
    mockRedis = {
      pipeline: jest.fn(),
      zrangebyscore: jest.fn(),
    };

    mockResponse = {
      setHeader: jest.fn(),
    };

    mockRequest = {};

    guard = new RateLimitGuard(mockRedis as any);
  });

  describe('when user is not authenticated', () => {
    it('should allow the request', async () => {
      mockRequest.user = undefined;
      const result = await guard.canActivate(createMockContext());
      expect(result).toBe(true);
    });
  });

  describe('when Redis is unavailable', () => {
    it('should allow the request gracefully', async () => {
      mockRequest.user = {
        tipo: 'usuario',
        empresa_id: 'emp-1',
        rnc: '123456789',
        usuario_id: 'user-1',
        rol: 'admin',
      };

      mockRedis.pipeline.mockReturnValue({
        zremrangebyscore: jest.fn().mockReturnThis(),
        zcard: jest.fn().mockReturnThis(),
        exec: jest.fn().mockRejectedValue(new Error('Connection refused')),
      });

      const result = await guard.canActivate(createMockContext());
      expect(result).toBe(true);
    });
  });

  describe('when user is within rate limit', () => {
    it('should allow request for usuario with count below 100', async () => {
      mockRequest.user = {
        tipo: 'usuario',
        empresa_id: 'emp-1',
        rnc: '123456789',
        usuario_id: 'user-1',
        rol: 'admin',
      };

      const pipelineMock = {
        zremrangebyscore: jest.fn().mockReturnThis(),
        zcard: jest.fn().mockReturnThis(),
        zadd: jest.fn().mockReturnThis(),
        expire: jest.fn().mockReturnThis(),
        exec: jest
          .fn()
          .mockResolvedValueOnce([
            [null, 0], // zremrangebyscore result
            [null, 50], // zcard result: 50 requests in window
          ])
          .mockResolvedValueOnce([
            [null, 1], // zadd result
            [null, 0], // zremrangebyscore result
            [null, 1], // expire result
          ]),
      };

      mockRedis.pipeline.mockReturnValue(pipelineMock);

      const result = await guard.canActivate(createMockContext());
      expect(result).toBe(true);
    });

    it('should allow request for api_key with count below 1000', async () => {
      mockRequest.user = {
        tipo: 'api_key',
        empresa_id: 'emp-1',
        rnc: '123456789',
        api_key_id: 'key-1',
        scopes: ['facturas:crear'],
      };

      const pipelineMock = {
        zremrangebyscore: jest.fn().mockReturnThis(),
        zcard: jest.fn().mockReturnThis(),
        zadd: jest.fn().mockReturnThis(),
        expire: jest.fn().mockReturnThis(),
        exec: jest
          .fn()
          .mockResolvedValueOnce([
            [null, 0],
            [null, 500], // 500 requests - below 1000 limit
          ])
          .mockResolvedValueOnce([
            [null, 1],
            [null, 0],
            [null, 1],
          ]),
      };

      mockRedis.pipeline.mockReturnValue(pipelineMock);

      const result = await guard.canActivate(createMockContext());
      expect(result).toBe(true);
    });
  });

  describe('when user exceeds rate limit', () => {
    it('should throw 429 for usuario exceeding 100 req/min', async () => {
      mockRequest.user = {
        tipo: 'usuario',
        empresa_id: 'emp-1',
        rnc: '123456789',
        usuario_id: 'user-1',
        rol: 'admin',
      };

      const pipelineMock = {
        zremrangebyscore: jest.fn().mockReturnThis(),
        zcard: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValueOnce([
          [null, 0],
          [null, 100], // Exactly at limit
        ]),
      };

      mockRedis.pipeline.mockReturnValue(pipelineMock);

      // Mock the oldest entry for Retry-After calculation
      const now = Date.now();
      const oldestTimestamp = now - 30000; // 30 seconds ago
      mockRedis.zrangebyscore.mockResolvedValue([`${oldestTimestamp}:abc123`]);

      try {
        await guard.canActivate(createMockContext());
        fail('Should have thrown HttpException');
      } catch (error) {
        expect(error).toBeInstanceOf(HttpException);
        expect((error as HttpException).getStatus()).toBe(HttpStatus.TOO_MANY_REQUESTS);
      }

      expect(mockResponse.setHeader).toHaveBeenCalledWith('Retry-After', expect.any(String));
    });

    it('should throw 429 for api_key exceeding 1000 req/min', async () => {
      mockRequest.user = {
        tipo: 'api_key',
        empresa_id: 'emp-1',
        rnc: '123456789',
        api_key_id: 'key-1',
        scopes: ['facturas:crear'],
      };

      const pipelineMock = {
        zremrangebyscore: jest.fn().mockReturnThis(),
        zcard: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValueOnce([
          [null, 0],
          [null, 1000], // At limit
        ]),
      };

      mockRedis.pipeline.mockReturnValue(pipelineMock);

      const now = Date.now();
      const oldestTimestamp = now - 45000; // 45 seconds ago
      mockRedis.zrangebyscore.mockResolvedValue([`${oldestTimestamp}:xyz789`]);

      try {
        await guard.canActivate(createMockContext());
        fail('Should have thrown HttpException');
      } catch (error) {
        expect(error).toBeInstanceOf(HttpException);
        expect((error as HttpException).getStatus()).toBe(HttpStatus.TOO_MANY_REQUESTS);
      }

      expect(mockResponse.setHeader).toHaveBeenCalledWith('Retry-After', expect.any(String));
    });

    it('should include Retry-After header with seconds until window reset', async () => {
      mockRequest.user = {
        tipo: 'usuario',
        empresa_id: 'emp-1',
        rnc: '123456789',
        usuario_id: 'user-1',
        rol: 'admin',
      };

      const pipelineMock = {
        zremrangebyscore: jest.fn().mockReturnThis(),
        zcard: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValueOnce([
          [null, 0],
          [null, 100],
        ]),
      };

      mockRedis.pipeline.mockReturnValue(pipelineMock);

      // Oldest entry was 10 seconds ago -> Retry-After should be ~50 seconds
      const now = Date.now();
      const oldestTimestamp = now - 10000;
      mockRedis.zrangebyscore.mockResolvedValue([`${oldestTimestamp}:abc123`]);

      try {
        await guard.canActivate(createMockContext());
      } catch (error) {
        // Expected
      }

      const retryAfterValue = parseInt(mockResponse.setHeader.mock.calls[0][1] as string, 10);
      // Should be approximately 50 seconds (60 - 10)
      expect(retryAfterValue).toBeGreaterThanOrEqual(49);
      expect(retryAfterValue).toBeLessThanOrEqual(51);
    });
  });

  describe('key generation', () => {
    it('should use usuario_id for human users', async () => {
      mockRequest.user = {
        tipo: 'usuario',
        empresa_id: 'emp-1',
        rnc: '123456789',
        usuario_id: 'user-42',
        rol: 'facturador',
      };

      const pipelineMock = {
        zremrangebyscore: jest.fn().mockReturnThis(),
        zcard: jest.fn().mockReturnThis(),
        zadd: jest.fn().mockReturnThis(),
        expire: jest.fn().mockReturnThis(),
        exec: jest
          .fn()
          .mockResolvedValueOnce([
            [null, 0],
            [null, 0],
          ])
          .mockResolvedValueOnce([
            [null, 1],
            [null, 0],
            [null, 1],
          ]),
      };

      mockRedis.pipeline.mockReturnValue(pipelineMock);

      await guard.canActivate(createMockContext());

      // The first pipeline call should include zremrangebyscore for the user key
      const firstCall = pipelineMock.zremrangebyscore.mock.calls[0];
      expect(firstCall[0]).toBe('rate_limit:user:user-42');
    });

    it('should use api_key_id for API key users', async () => {
      mockRequest.user = {
        tipo: 'api_key',
        empresa_id: 'emp-1',
        rnc: '123456789',
        api_key_id: 'apikey-99',
        scopes: ['facturas:leer'],
      };

      const pipelineMock = {
        zremrangebyscore: jest.fn().mockReturnThis(),
        zcard: jest.fn().mockReturnThis(),
        zadd: jest.fn().mockReturnThis(),
        expire: jest.fn().mockReturnThis(),
        exec: jest
          .fn()
          .mockResolvedValueOnce([
            [null, 0],
            [null, 0],
          ])
          .mockResolvedValueOnce([
            [null, 1],
            [null, 0],
            [null, 1],
          ]),
      };

      mockRedis.pipeline.mockReturnValue(pipelineMock);

      await guard.canActivate(createMockContext());

      const firstCall = pipelineMock.zremrangebyscore.mock.calls[0];
      expect(firstCall[0]).toBe('rate_limit:apikey:apikey-99');
    });
  });
});
