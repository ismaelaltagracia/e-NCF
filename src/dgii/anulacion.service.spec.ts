import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';

import { AnulacionService, type AnulacionParams } from './anulacion.service.js';
import { FirmaService } from './firma.service.js';
import { DgiiTokenService } from './token.service.js';
import { CircuitBreakerService } from './circuit-breaker.service.js';

describe('AnulacionService', () => {
  let service: AnulacionService;

  const mockFirmaService = {
    firmarEcf: jest.fn(),
  };

  const mockTokenService = {
    obtenerToken: jest.fn(),
  };

  const mockCircuitBreaker = {
    execute: jest.fn(),
  };

  const mockConfigService = {
    get: jest.fn((key: string, defaultValue: string) => {
      if (key === 'DGII_ANULACION_URL') {
        return 'https://ecf.dgii.gov.do/CerteCF/AnulacionCF';
      }
      return defaultValue;
    }),
  };

  const baseParams: AnulacionParams = {
    factura_id: 'factura-uuid-1',
    empresa_id: 'empresa-uuid-1',
    e_ncf: 'E310000000001',
    rnc_emisor: '123456789',
    motivo: 'Error en datos del comprador',
    correlation_id: 'corr-id-1',
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AnulacionService,
        { provide: FirmaService, useValue: mockFirmaService },
        { provide: DgiiTokenService, useValue: mockTokenService },
        { provide: CircuitBreakerService, useValue: mockCircuitBreaker },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    service = module.get<AnulacionService>(AnulacionService);
    jest.clearAllMocks();
  });

  describe('anular', () => {
    it('should generate XML, sign, get token, and transmit via circuit breaker', async () => {
      mockFirmaService.firmarEcf.mockResolvedValue('<AnulacioneCF signed/>');
      mockTokenService.obtenerToken.mockResolvedValue('bearer-token-123');
      mockCircuitBreaker.execute.mockImplementation(async (fn: () => Promise<unknown>) => fn());

      // Mock global fetch for successful response
      const mockFetch = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: () => Promise.resolve('<Respuesta>OK</Respuesta>'),
      });
      global.fetch = mockFetch;

      const result = await service.anular(baseParams);

      expect(mockFirmaService.firmarEcf).toHaveBeenCalledWith(
        expect.stringContaining('AnulacioneCF'),
        'empresa-uuid-1',
      );
      expect(mockTokenService.obtenerToken).toHaveBeenCalledWith('empresa-uuid-1');
      expect(mockCircuitBreaker.execute).toHaveBeenCalledWith(
        expect.any(Function),
        'anulacion-ecf:factura-uuid-1',
      );
      expect(result.exito).toBe(true);
    });

    it('should include correct fields in the annulment XML', async () => {
      let capturedXml = '';
      mockFirmaService.firmarEcf.mockImplementation(async (xml: string) => {
        capturedXml = xml;
        return '<signed/>';
      });
      mockTokenService.obtenerToken.mockResolvedValue('token');
      mockCircuitBreaker.execute.mockImplementation(async (fn: () => Promise<unknown>) => fn());

      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: () => Promise.resolve('OK'),
      });

      await service.anular(baseParams);

      expect(capturedXml).toContain('AnulacioneCF');
      expect(capturedXml).toContain('123456789'); // RNC emisor
      expect(capturedXml).toContain('E310000000001'); // e-NCF
      expect(capturedXml).toContain('Error en datos del comprador'); // motivo
      expect(capturedXml).toContain('urn:dgii.gov.do:ecf:anulacion:2019'); // namespace
    });

    it('should return failure with error details when DGII rejects (4xx)', async () => {
      mockFirmaService.firmarEcf.mockResolvedValue('<signed/>');
      mockTokenService.obtenerToken.mockResolvedValue('token');
      mockCircuitBreaker.execute.mockImplementation(async (fn: () => Promise<unknown>) => fn());

      const errorResponse = { codigo: 'ANL-001', mensaje: 'NCF no encontrado' };
      global.fetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 422,
        text: () => Promise.resolve(JSON.stringify(errorResponse)),
      });

      const result = await service.anular(baseParams);

      expect(result.exito).toBe(false);
      expect(result.error_dgii).toEqual(errorResponse);
    });

    it('should throw on server errors (5xx) to trigger circuit breaker', async () => {
      mockFirmaService.firmarEcf.mockResolvedValue('<signed/>');
      mockTokenService.obtenerToken.mockResolvedValue('token');
      mockCircuitBreaker.execute.mockImplementation(async (fn: () => Promise<unknown>) => fn());

      global.fetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 500,
        text: () => Promise.resolve('Internal Server Error'),
      });

      await expect(service.anular(baseParams)).rejects.toThrow(
        /Endpoint de anulación DGII respondió con error 500/,
      );
    });

    it('should throw on network errors', async () => {
      mockFirmaService.firmarEcf.mockResolvedValue('<signed/>');
      mockTokenService.obtenerToken.mockResolvedValue('token');
      mockCircuitBreaker.execute.mockImplementation(async (fn: () => Promise<unknown>) => fn());

      global.fetch = jest.fn().mockRejectedValue(new Error('Network timeout'));

      await expect(service.anular(baseParams)).rejects.toThrow(
        /Error de red contactando DGII/,
      );
    });

    it('should handle non-JSON rejection responses gracefully', async () => {
      mockFirmaService.firmarEcf.mockResolvedValue('<signed/>');
      mockTokenService.obtenerToken.mockResolvedValue('token');
      mockCircuitBreaker.execute.mockImplementation(async (fn: () => Promise<unknown>) => fn());

      global.fetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 400,
        text: () => Promise.resolve('<Error>Bad Request</Error>'),
      });

      const result = await service.anular(baseParams);

      expect(result.exito).toBe(false);
      expect(result.error_dgii).toEqual({
        raw_response: '<Error>Bad Request</Error>',
        status_code: 400,
      });
    });
  });
});
