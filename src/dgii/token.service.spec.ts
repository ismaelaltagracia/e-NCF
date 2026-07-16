import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';

import { DgiiTokenService } from './token.service.js';
import { SemillaService } from './semilla.service.js';
import { FirmaService } from './firma.service.js';
import { REDIS_CLIENT } from '../common/guards/rate-limit.guard.js';

// Mock correlation-id
jest.mock('../common/interceptors/correlation-id.interceptor.js', () => ({
  getCorrelationId: () => 'test-correlation-id',
}));

// Mock global fetch
const mockFetch = jest.fn();
global.fetch = mockFetch;

describe('DgiiTokenService', () => {
  let service: DgiiTokenService;
  let semillaService: jest.Mocked<Pick<SemillaService, 'solicitarSemilla'>>;
  let firmaService: jest.Mocked<Pick<FirmaService, 'firmarSemilla'>>;
  let redisClient: { get: jest.Mock; set: jest.Mock };

  const MOCK_SEMILLA_XML = '<SemillaModel><valor>abc123</valor></SemillaModel>';
  const MOCK_SIGNED_XML = '<SignedXml>...</SignedXml>';
  const MOCK_TOKEN = 'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.mock-token';
  const MOCK_EMPRESA_ID = 'empresa-uuid-001';

  const buildTokenResponse = (token: string) =>
    `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <AutenticacionResult xmlns="urn:dgii.gov.do:ecf:remision:2019">
      <token>${token}</token>
    </AutenticacionResult>
  </soap:Body>
</soap:Envelope>`;

  beforeEach(async () => {
    semillaService = {
      solicitarSemilla: jest.fn().mockResolvedValue(MOCK_SEMILLA_XML),
    };

    firmaService = {
      firmarSemilla: jest.fn().mockResolvedValue(MOCK_SIGNED_XML),
    };

    redisClient = {
      get: jest.fn().mockResolvedValue(null),
      set: jest.fn().mockResolvedValue('OK'),
    };

    mockFetch.mockReset();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DgiiTokenService,
        { provide: SemillaService, useValue: semillaService },
        { provide: FirmaService, useValue: firmaService },
        { provide: REDIS_CLIENT, useValue: redisClient },
        {
          provide: ConfigService,
          useValue: {
            get: (key: string, defaultValue: string) => {
              if (key === 'DGII_TOKEN_URL') return 'https://ecf.dgii.gov.do/token';
              return defaultValue;
            },
          },
        },
      ],
    }).compile();

    service = module.get<DgiiTokenService>(DgiiTokenService);
  });

  describe('obtenerToken', () => {
    it('should return cached token from Redis if available (Req 7.3)', async () => {
      redisClient.get.mockResolvedValue(MOCK_TOKEN);

      const token = await service.obtenerToken(MOCK_EMPRESA_ID);

      expect(token).toBe(MOCK_TOKEN);
      expect(redisClient.get).toHaveBeenCalledWith(`dgii_token:${MOCK_EMPRESA_ID}`);
      expect(semillaService.solicitarSemilla).not.toHaveBeenCalled();
      expect(firmaService.firmarSemilla).not.toHaveBeenCalled();
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should perform full handshake when no cached token (Req 7.1)', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        text: () => Promise.resolve(buildTokenResponse(MOCK_TOKEN)),
      });

      const token = await service.obtenerToken(MOCK_EMPRESA_ID);

      expect(token).toBe(MOCK_TOKEN);
      expect(semillaService.solicitarSemilla).toHaveBeenCalled();
      expect(firmaService.firmarSemilla).toHaveBeenCalledWith(MOCK_SEMILLA_XML, MOCK_EMPRESA_ID);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://ecf.dgii.gov.do/token',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'text/xml; charset=utf-8',
          }),
        }),
      );
    });

    it('should store token in Redis with TTL 3540s after handshake (Req 7.2)', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        text: () => Promise.resolve(buildTokenResponse(MOCK_TOKEN)),
      });

      await service.obtenerToken(MOCK_EMPRESA_ID);

      expect(redisClient.set).toHaveBeenCalledWith(
        `dgii_token:${MOCK_EMPRESA_ID}`,
        MOCK_TOKEN,
        'EX',
        3540,
      );
    });

    it('should throw UnauthorizedException (401) if DGII rejects signed seed (Req 7.4)', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 401,
        text: () => Promise.resolve('Unauthorized - Invalid signature'),
      });

      await expect(service.obtenerToken(MOCK_EMPRESA_ID)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should throw ServiceUnavailableException (503) if DGII endpoint unreachable (Req 7.5)', async () => {
      mockFetch.mockRejectedValue(new Error('connect ECONNREFUSED'));

      await expect(service.obtenerToken(MOCK_EMPRESA_ID)).rejects.toThrow(
        ServiceUnavailableException,
      );
    });

    it('should throw ServiceUnavailableException (503) on timeout (Req 7.5)', async () => {
      mockFetch.mockRejectedValue(new DOMException('The operation was aborted', 'AbortError'));

      await expect(service.obtenerToken(MOCK_EMPRESA_ID)).rejects.toThrow(
        ServiceUnavailableException,
      );
    });

    it('should throw ServiceUnavailableException on non-401/403 error status', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        text: () => Promise.resolve('Internal Server Error'),
      });

      await expect(service.obtenerToken(MOCK_EMPRESA_ID)).rejects.toThrow(
        ServiceUnavailableException,
      );
    });

    it('should proceed without cache if Redis is unreachable on read (Req 7.6)', async () => {
      redisClient.get.mockRejectedValue(new Error('ECONNREFUSED'));
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        text: () => Promise.resolve(buildTokenResponse(MOCK_TOKEN)),
      });

      const token = await service.obtenerToken(MOCK_EMPRESA_ID);

      expect(token).toBe(MOCK_TOKEN);
      // Handshake was performed despite Redis failure
      expect(semillaService.solicitarSemilla).toHaveBeenCalled();
    });

    it('should proceed without caching if Redis is unreachable on write (Req 7.6)', async () => {
      redisClient.set.mockRejectedValue(new Error('ECONNREFUSED'));
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        text: () => Promise.resolve(buildTokenResponse(MOCK_TOKEN)),
      });

      // Should not throw - token is returned even if caching fails
      const token = await service.obtenerToken(MOCK_EMPRESA_ID);
      expect(token).toBe(MOCK_TOKEN);
    });

    it('should throw ServiceUnavailableException if token cannot be extracted from response', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        text: () => Promise.resolve('<soap:Envelope><soap:Body><empty/></soap:Body></soap:Envelope>'),
      });

      await expect(service.obtenerToken(MOCK_EMPRESA_ID)).rejects.toThrow(
        ServiceUnavailableException,
      );
    });
  });
});
