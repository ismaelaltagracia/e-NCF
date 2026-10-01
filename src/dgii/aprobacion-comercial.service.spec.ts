import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';

import {
  AprobacionComercialService,
  EstadoAcecf,
  type AprobacionComercialParams,
} from './aprobacion-comercial.service.js';
import { FirmaService } from './firma.service.js';
import { DgiiTokenService } from './token.service.js';
import { CircuitBreakerService } from './circuit-breaker.service.js';

describe('AprobacionComercialService', () => {
  let service: AprobacionComercialService;

  const mockFirmaService = { firmarEcf: jest.fn() };
  const mockTokenService = { obtenerToken: jest.fn() };
  const mockCircuitBreaker = { execute: jest.fn() };
  const mockConfigService = {
    get: jest.fn((key: string, def: string) =>
      key === 'DGII_ACECF_URL' ? 'https://ecf.dgii.gov.do/CerteCF/AprobacionComercial' : def,
    ),
  };

  const mockFetch = jest.fn();
  global.fetch = mockFetch as unknown as typeof fetch;

  const baseParams: AprobacionComercialParams = {
    empresa_id: 'empresa-uuid-1',
    rnc_comprador: '101000001',
    rnc_emisor: '123456789',
    e_ncf: 'E320000000001',
    fecha_emision: '2026-01-15',
    monto_total: 5900,
    estado: EstadoAcecf.APROBADO,
    correlation_id: 'corr-1',
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AprobacionComercialService,
        { provide: FirmaService, useValue: mockFirmaService },
        { provide: DgiiTokenService, useValue: mockTokenService },
        { provide: CircuitBreakerService, useValue: mockCircuitBreaker },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    service = module.get<AprobacionComercialService>(AprobacionComercialService);

    jest.clearAllMocks();
    mockFirmaService.firmarEcf.mockResolvedValue('<ACECF>signed</ACECF>');
    mockTokenService.obtenerToken.mockResolvedValue('bearer-token');
    // El circuit breaker ejecuta la función que se le pasa.
    mockCircuitBreaker.execute.mockImplementation((fn: () => Promise<unknown>) => fn());
  });

  it('should sign, get token and transmit an approval, returning exito=true on 2xx', async () => {
    mockFetch.mockResolvedValue({ ok: true, status: 200, text: () => Promise.resolve('OK') });

    const result = await service.aprobar(baseParams);

    expect(mockFirmaService.firmarEcf).toHaveBeenCalledWith(
      expect.stringContaining('ACECF'),
      'empresa-uuid-1',
    );
    expect(mockTokenService.obtenerToken).toHaveBeenCalledWith('empresa-uuid-1', undefined);
    expect(result.exito).toBe(true);
  });

  it('should include the rejection reason in the XML when estado is RECHAZADO', async () => {
    mockFetch.mockResolvedValue({ ok: true, status: 200, text: () => Promise.resolve('OK') });

    await service.aprobar({
      ...baseParams,
      estado: EstadoAcecf.RECHAZADO,
      detalle_motivo: 'Mercancía no recibida',
    });

    const xmlFirmado = mockFirmaService.firmarEcf.mock.calls[0][0] as string;
    expect(xmlFirmado).toContain('Mercancía no recibida');
  });

  it('should return exito=false with error_dgii on a business rejection (4xx)', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 422,
      text: () => Promise.resolve('{"codigo":"X"}'),
    });

    const result = await service.aprobar(baseParams);

    expect(result.exito).toBe(false);
    expect(result.error_dgii).toBeDefined();
  });

  it('should throw on server error (5xx) to trigger circuit breaker', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 500,
      text: () => Promise.resolve('server error'),
    });

    await expect(service.aprobar(baseParams)).rejects.toThrow();
  });
});
