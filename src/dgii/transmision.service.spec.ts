import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { HttpException, HttpStatus } from '@nestjs/common';

import { TransmisionService, TransmisionParams } from './transmision.service.js';
import { DgiiTokenService } from './token.service.js';
import { CircuitBreakerService } from './circuit-breaker.service.js';
import { REDIS_CLIENT } from '../common/guards/rate-limit.guard.js';
import { RETRY_QUEUE_SERVICE, IRetryQueueService } from '../infrastructure/queue/retry-queue.interfaces.js';

// Mock correlation-id
jest.mock('../common/interceptors/correlation-id.interceptor.js', () => ({
  getCorrelationId: () => 'test-correlation-id',
}));

// Mock global fetch
const mockFetch = jest.fn();
global.fetch = mockFetch;

describe('TransmisionService', () => {
  let service: TransmisionService;
  let tokenService: { obtenerToken: jest.Mock };
  let circuitBreaker: { execute: jest.Mock };
  let redisClient: { del: jest.Mock };
  let retryQueue: { encolarTransmision: jest.Mock };

  const MOCK_TOKEN = 'eyJhbGciOiJSUzI1NiJ9.mock-bearer-token';
  const MOCK_TRACK_ID = 'TRK-2024-001-ABC';
  const MOCK_PARAMS: TransmisionParams = {
    factura_id: 'factura-uuid-001',
    empresa_id: 'empresa-uuid-001',
    xml_firmado: '<ECF><Encabezado>...</Encabezado></ECF>',
    correlation_id: 'corr-123',
  };

  const buildDgiiSuccessResponse = (trackId: string) =>
    `<?xml version="1.0" encoding="utf-8"?>
<Respuesta>
  <TrackId>${trackId}</TrackId>
  <Estado>Aceptado</Estado>
</Respuesta>`;

  beforeEach(async () => {
    tokenService = {
      obtenerToken: jest.fn().mockResolvedValue(MOCK_TOKEN),
    };

    // CircuitBreaker.execute just runs the operation passed to it
    circuitBreaker = {
      execute: jest.fn().mockImplementation(
        (operation: () => Promise<unknown>) => operation(),
      ),
    };

    redisClient = {
      del: jest.fn().mockResolvedValue(1),
    };

    retryQueue = {
      encolarTransmision: jest.fn().mockResolvedValue('job-id-001'),
    };

    mockFetch.mockReset();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TransmisionService,
        { provide: DgiiTokenService, useValue: tokenService },
        { provide: CircuitBreakerService, useValue: circuitBreaker },
        { provide: REDIS_CLIENT, useValue: redisClient },
        { provide: RETRY_QUEUE_SERVICE, useValue: retryQueue },
        {
          provide: ConfigService,
          useValue: {
            get: (key: string, defaultValue: string) => {
              if (key === 'DGII_ECF_URL') return 'https://ecf.dgii.gov.do/CerteCF/EmisionCF';
              return defaultValue;
            },
          },
        },
      ],
    }).compile();

    service = module.get<TransmisionService>(TransmisionService);
  });

  describe('transmitir - happy path (Req 11.1, 11.2)', () => {
    it('should transmit XML and extract Track_ID from successful response', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        text: () => Promise.resolve(buildDgiiSuccessResponse(MOCK_TRACK_ID)),
      });

      const result = await service.transmitir(MOCK_PARAMS);

      expect(result.track_id).toBe(MOCK_TRACK_ID);
      expect(result.estado).toBe('aceptado');
      expect(result.error_dgii).toBeUndefined();
    });

    it('should call DGII endpoint with Bearer token and 30s timeout', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        text: () => Promise.resolve(buildDgiiSuccessResponse(MOCK_TRACK_ID)),
      });

      await service.transmitir(MOCK_PARAMS);

      expect(tokenService.obtenerToken).toHaveBeenCalledWith(MOCK_PARAMS.empresa_id);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://ecf.dgii.gov.do/CerteCF/EmisionCF',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            Authorization: `Bearer ${MOCK_TOKEN}`,
            'Content-Type': 'application/xml',
          }),
          body: MOCK_PARAMS.xml_firmado,
          signal: expect.any(AbortSignal),
        }),
      );
    });

    it('should use CircuitBreaker to wrap the HTTP call', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        text: () => Promise.resolve(buildDgiiSuccessResponse(MOCK_TRACK_ID)),
      });

      await service.transmitir(MOCK_PARAMS);

      expect(circuitBreaker.execute).toHaveBeenCalledWith(
        expect.any(Function),
        `transmision-ecf:${MOCK_PARAMS.factura_id}`,
      );
    });

    it('should return aceptado with null track_id if TrackId not in response', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        text: () => Promise.resolve('<Respuesta><Estado>Aceptado</Estado></Respuesta>'),
      });

      const result = await service.transmitir(MOCK_PARAMS);

      expect(result.track_id).toBeNull();
      expect(result.estado).toBe('aceptado');
    });
  });

  describe('transmitir - token expired / re-handshake (Req 11.5)', () => {
    it('should invalidate Redis cache, re-handshake and retry on 401', async () => {
      // First call: 401 → re-handshake → second call: success
      mockFetch
        .mockResolvedValueOnce({
          ok: false,
          status: 401,
          text: () => Promise.resolve('Token expired'),
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          text: () => Promise.resolve(buildDgiiSuccessResponse(MOCK_TRACK_ID)),
        });

      const result = await service.transmitir(MOCK_PARAMS);

      expect(result.track_id).toBe(MOCK_TRACK_ID);
      expect(result.estado).toBe('aceptado');
      expect(redisClient.del).toHaveBeenCalledWith(`dgii_token:${MOCK_PARAMS.empresa_id}`);
      expect(tokenService.obtenerToken).toHaveBeenCalledTimes(2);
    });

    it('should throw 401 HttpException if retry also returns 401', async () => {
      // Both calls return 401
      mockFetch.mockResolvedValue({
        ok: false,
        status: 401,
        text: () => Promise.resolve('Token expired'),
      });

      await expect(service.transmitir(MOCK_PARAMS)).rejects.toThrow(HttpException);

      try {
        await service.transmitir(MOCK_PARAMS);
      } catch (error) {
        const httpError = error as HttpException;
        expect(httpError.getStatus()).toBe(HttpStatus.UNAUTHORIZED);
      }
    });

    it('should enqueue if retry after re-handshake hits a transient error', async () => {
      // First call: 401 → second call: 500
      mockFetch
        .mockResolvedValueOnce({
          ok: false,
          status: 401,
          text: () => Promise.resolve('Token expired'),
        })
        .mockResolvedValueOnce({
          ok: false,
          status: 503,
          text: () => Promise.resolve('Service Unavailable'),
        });

      const result = await service.transmitir(MOCK_PARAMS);

      expect(result.estado).toBe('reintentando');
      expect(retryQueue.encolarTransmision).toHaveBeenCalled();
    });
  });

  describe('transmitir - transient errors (Req 11.4)', () => {
    it('should enqueue in BullMQ on 5xx response from DGII', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        text: () => Promise.resolve('Internal Server Error'),
      });

      const result = await service.transmitir(MOCK_PARAMS);

      expect(result.track_id).toBeNull();
      expect(result.estado).toBe('reintentando');
      expect(retryQueue.encolarTransmision).toHaveBeenCalledWith({
        factura_id: MOCK_PARAMS.factura_id,
        empresa_id: MOCK_PARAMS.empresa_id,
        xml_firmado: MOCK_PARAMS.xml_firmado,
        correlation_id: MOCK_PARAMS.correlation_id,
        intento: 1,
      });
    });

    it('should enqueue in BullMQ on network error (timeout/DNS)', async () => {
      mockFetch.mockRejectedValue(new Error('connect ECONNREFUSED'));

      const result = await service.transmitir(MOCK_PARAMS);

      expect(result.estado).toBe('reintentando');
      expect(retryQueue.encolarTransmision).toHaveBeenCalled();
    });

    it('should throw 503 if retryQueue is null on transient error', async () => {
      // Create service without retryQueue
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          TransmisionService,
          { provide: DgiiTokenService, useValue: tokenService },
          { provide: CircuitBreakerService, useValue: circuitBreaker },
          { provide: REDIS_CLIENT, useValue: redisClient },
          {
            provide: ConfigService,
            useValue: {
              get: (key: string, defaultValue: string) => {
                if (key === 'DGII_ECF_URL') return 'https://ecf.dgii.gov.do/CerteCF/EmisionCF';
                return defaultValue;
              },
            },
          },
        ],
      }).compile();

      const serviceWithoutQueue = module.get<TransmisionService>(TransmisionService);

      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        text: () => Promise.resolve('Internal Server Error'),
      });

      await expect(serviceWithoutQueue.transmitir(MOCK_PARAMS)).rejects.toThrow(HttpException);

      try {
        await serviceWithoutQueue.transmitir(MOCK_PARAMS);
      } catch (error) {
        expect((error as HttpException).getStatus()).toBe(HttpStatus.SERVICE_UNAVAILABLE);
      }
    });
  });

  describe('transmitir - circuit breaker open', () => {
    it('should enqueue in BullMQ when CircuitBreaker throws 503', async () => {
      circuitBreaker.execute.mockRejectedValue(
        new HttpException(
          {
            statusCode: HttpStatus.SERVICE_UNAVAILABLE,
            message: 'Circuit breaker abierto',
            retryAfter: 30,
          },
          HttpStatus.SERVICE_UNAVAILABLE,
        ),
      );

      const result = await service.transmitir(MOCK_PARAMS);

      expect(result.track_id).toBeNull();
      expect(result.estado).toBe('reintentando');
      expect(retryQueue.encolarTransmision).toHaveBeenCalledWith(
        expect.objectContaining({
          factura_id: MOCK_PARAMS.factura_id,
          empresa_id: MOCK_PARAMS.empresa_id,
        }),
      );
    });
  });

  describe('transmitir - business rejection (Req 11.3)', () => {
    it('should return rechazado with DGII error details on 4xx (non-401)', async () => {
      const dgiiError = {
        codigo: 'ECF-001',
        mensaje: 'RNC no válido',
        detalle: 'El RNC del emisor no corresponde',
      };

      mockFetch.mockResolvedValue({
        ok: false,
        status: 422,
        text: () => Promise.resolve(JSON.stringify(dgiiError)),
      });

      const result = await service.transmitir(MOCK_PARAMS);

      expect(result.track_id).toBeNull();
      expect(result.estado).toBe('rechazado');
      expect(result.error_dgii).toEqual(dgiiError);
    });

    it('should return raw response as error_dgii if response is not JSON', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 400,
        text: () => Promise.resolve('<Error>Bad Request</Error>'),
      });

      const result = await service.transmitir(MOCK_PARAMS);

      expect(result.estado).toBe('rechazado');
      expect(result.error_dgii).toEqual({
        raw_response: '<Error>Bad Request</Error>',
        status_code: 400,
      });
    });

    it('should NOT enqueue business rejections for retry', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 422,
        text: () => Promise.resolve(JSON.stringify({ codigo: 'ERR-01' })),
      });

      await service.transmitir(MOCK_PARAMS);

      expect(retryQueue.encolarTransmision).not.toHaveBeenCalled();
    });
  });
});
