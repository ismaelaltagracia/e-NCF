import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { ServiceUnavailableException, BadGatewayException } from '@nestjs/common';
import { SemillaService } from './semilla.service.js';

const mockFetch = jest.fn();
global.fetch = mockFetch;

describe('SemillaService', () => {
  let service: SemillaService;
  let module: TestingModule;

  // La semilla real de la DGII es un XML plano (no SOAP).
  const VALID_SEED = `<?xml version="1.0" encoding="utf-8"?>
<SemillaModel xmlns:xsd="http://www.w3.org/2001/XMLSchema">
  <valor>abc123semilla</valor>
  <fecha>2026-01-15T10:00:00</fecha>
</SemillaModel>`;

  const SEED_URL = 'https://ecf.dgii.gov.do/CerteCF/Autenticacion/api/Autenticacion/Semilla';

  beforeEach(async () => {
    jest.clearAllMocks();

    module = await Test.createTestingModule({
      providers: [
        SemillaService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string, defaultValue?: string) => {
              if (key === 'DGII_SEMILLA_URL') return SEED_URL;
              return defaultValue;
            }),
          },
        },
      ],
    }).compile();

    service = module.get<SemillaService>(SemillaService);
  });

  afterAll(async () => {
    await module.close();
  });

  describe('solicitarSemilla', () => {
    it('should GET the seed XML from the REST endpoint', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: () => Promise.resolve(VALID_SEED),
      });

      const result = await service.solicitarSemilla();

      expect(result).toBe(VALID_SEED);
      expect(mockFetch).toHaveBeenCalledWith(
        SEED_URL,
        expect.objectContaining({ method: 'GET' }),
      );
    });

    it('should use an AbortController signal (timeout)', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: () => Promise.resolve(VALID_SEED),
      });

      await service.solicitarSemilla();

      const callArgs = mockFetch.mock.calls[0][1];
      expect(callArgs.signal).toBeInstanceOf(AbortSignal);
    });

    it('should target the production segment (eCF) when ambiente is produccion', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: () => Promise.resolve(VALID_SEED),
      });

      await service.solicitarSemilla('produccion');

      expect(mockFetch).toHaveBeenCalledWith(
        'https://ecf.dgii.gov.do/eCF/Autenticacion/api/Autenticacion/Semilla',
        expect.anything(),
      );
    });

    describe('503 ServiceUnavailableException - network/timeout/non-200', () => {
      it('should throw 503 when fetch throws network error', async () => {
        mockFetch.mockRejectedValueOnce(new Error('ECONNREFUSED'));
        await expect(service.solicitarSemilla()).rejects.toThrow(ServiceUnavailableException);
      });

      it('should throw 503 when DGII returns non-200 status', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: false,
          status: 500,
          text: () => Promise.resolve('Internal Server Error'),
        });
        await expect(service.solicitarSemilla()).rejects.toThrow(ServiceUnavailableException);
      });
    });

    describe('502 BadGatewayException - malformed response', () => {
      it('should throw 502 when response is not XML (plain text)', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          status: 200,
          text: () => Promise.resolve('This is not XML at all'),
        });
        await expect(service.solicitarSemilla()).rejects.toThrow(BadGatewayException);
      });

      it('should throw 502 when XML is malformed (unclosed tags)', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          status: 200,
          text: () => Promise.resolve('<?xml version="1.0"?><SemillaModel><Unclosed>'),
        });
        await expect(service.solicitarSemilla()).rejects.toThrow(BadGatewayException);
      });

      it('should throw 502 when response is JSON instead of XML', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          status: 200,
          text: () => Promise.resolve('{"error": "something went wrong"}'),
        });
        await expect(service.solicitarSemilla()).rejects.toThrow(BadGatewayException);
      });
    });
  });
});
