import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { Repository } from 'typeorm';

import { EstadoPollingService } from './estado-polling.service.js';
import { CircuitBreakerService } from './circuit-breaker.service.js';
import { DgiiTokenService } from './token.service.js';
import { WebhooksService } from '../modules/webhooks/webhooks.service.js';
import { FacturaElectronica } from '../database/entities/factura-electronica.entity.js';
import { EstadoDgii } from '../database/enums.js';

describe('EstadoPollingService', () => {
  let service: EstadoPollingService;
  let facturaRepo: jest.Mocked<Repository<FacturaElectronica>>;
  let circuitBreaker: jest.Mocked<CircuitBreakerService>;
  let tokenService: jest.Mocked<DgiiTokenService>;
  let webhooksService: jest.Mocked<WebhooksService>;

  const mockConfigService = {
    get: jest.fn((key: string, defaultValue?: unknown) => {
      const config: Record<string, unknown> = {
        DGII_STATUS_ENDPOINT: 'https://ecf.dgii.gov.do/CerteCF/ConsultaEstado',
        DGII_POLLING_INTERVAL_MS: 300000,
      };
      return config[key] ?? defaultValue;
    }),
  };

  beforeEach(async () => {
    facturaRepo = {
      find: jest.fn(),
      update: jest.fn(),
    } as unknown as jest.Mocked<Repository<FacturaElectronica>>;

    circuitBreaker = {
      execute: jest.fn(),
      getState: jest.fn().mockReturnValue('CLOSED'),
    } as unknown as jest.Mocked<CircuitBreakerService>;

    tokenService = {
      obtenerToken: jest.fn().mockResolvedValue('mock-bearer-token'),
    } as unknown as jest.Mocked<DgiiTokenService>;

    webhooksService = {
      disparar: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<WebhooksService>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EstadoPollingService,
        { provide: getRepositoryToken(FacturaElectronica), useValue: facturaRepo },
        { provide: CircuitBreakerService, useValue: circuitBreaker },
        { provide: DgiiTokenService, useValue: tokenService },
        { provide: WebhooksService, useValue: webhooksService },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    service = module.get<EstadoPollingService>(EstadoPollingService);
  });

  describe('pollEstados', () => {
    it('should do nothing when no facturas have estado_dgii=aceptado', async () => {
      facturaRepo.find.mockResolvedValue([]);

      await service.pollEstados();

      expect(facturaRepo.find).toHaveBeenCalledWith({
        where: { estado_dgii: EstadoDgii.ACEPTADO },
      });
      expect(tokenService.obtenerToken).not.toHaveBeenCalled();
    });

    it('should skip facturas without track_id', async () => {
      const facturaSinTrackId = {
        id: 'factura-1',
        empresa_id: 'empresa-1',
        track_id: null,
        estado_dgii: EstadoDgii.ACEPTADO,
        correlation_id: 'corr-1',
      } as FacturaElectronica;

      facturaRepo.find.mockResolvedValue([facturaSinTrackId]);

      await service.pollEstados();

      expect(tokenService.obtenerToken).not.toHaveBeenCalled();
    });

    it('should query DGII status for facturas with track_id', async () => {
      const factura = {
        id: 'factura-1',
        empresa_id: 'empresa-1',
        track_id: 'TRACK-123',
        estado_dgii: EstadoDgii.ACEPTADO,
        correlation_id: 'corr-1',
        e_ncf: 'E310000000001',
      } as FacturaElectronica;

      facturaRepo.find.mockResolvedValue([factura]);
      circuitBreaker.execute.mockResolvedValue(null); // No state change

      await service.pollEstados();

      expect(tokenService.obtenerToken).toHaveBeenCalledWith('empresa-1');
      expect(circuitBreaker.execute).toHaveBeenCalled();
    });

    it('should update factura to aprobado on terminal status', async () => {
      const factura = {
        id: 'factura-1',
        empresa_id: 'empresa-1',
        track_id: 'TRACK-123',
        estado_dgii: EstadoDgii.ACEPTADO,
        correlation_id: 'corr-1',
        e_ncf: 'E310000000001',
      } as FacturaElectronica;

      facturaRepo.find.mockResolvedValue([factura]);
      circuitBreaker.execute.mockResolvedValue({
        trackId: 'TRACK-123',
        estado: 'aprobado',
        detalles: { message: 'Comprobante aprobado' },
      });
      facturaRepo.update.mockResolvedValue({} as any);

      await service.pollEstados();

      expect(facturaRepo.update).toHaveBeenCalledWith('factura-1', {
        estado_dgii: EstadoDgii.APROBADO,
      });
    });

    it('should update factura to rechazado_definitivo and store error_dgii', async () => {
      const factura = {
        id: 'factura-1',
        empresa_id: 'empresa-1',
        track_id: 'TRACK-456',
        estado_dgii: EstadoDgii.ACEPTADO,
        correlation_id: 'corr-2',
        e_ncf: 'E310000000002',
      } as FacturaElectronica;

      const detallesRechazo = {
        codigo: 'ERR-001',
        mensaje: 'RNC no válido',
      };

      facturaRepo.find.mockResolvedValue([factura]);
      circuitBreaker.execute.mockResolvedValue({
        trackId: 'TRACK-456',
        estado: 'rechazado_definitivo',
        detalles: detallesRechazo,
      });
      facturaRepo.update.mockResolvedValue({} as any);

      await service.pollEstados();

      expect(facturaRepo.update).toHaveBeenCalledWith('factura-1', {
        estado_dgii: EstadoDgii.RECHAZADO_DEFINITIVO,
        error_dgii: detallesRechazo,
      });
    });

    it('should trigger webhook when transitioning to aprobado', async () => {
      const factura = {
        id: 'factura-1',
        empresa_id: 'empresa-1',
        track_id: 'TRACK-123',
        estado_dgii: EstadoDgii.ACEPTADO,
        correlation_id: 'corr-1',
        e_ncf: 'E310000000001',
      } as FacturaElectronica;

      facturaRepo.find.mockResolvedValue([factura]);
      circuitBreaker.execute.mockResolvedValue({
        trackId: 'TRACK-123',
        estado: 'aprobado',
        detalles: { message: 'Aprobado' },
      });
      facturaRepo.update.mockResolvedValue({} as any);

      await service.pollEstados();

      expect(webhooksService.disparar).toHaveBeenCalledWith(
        'empresa-1',
        'factura_aceptada',
        expect.objectContaining({
          factura_id: 'factura-1',
          e_ncf: 'E310000000001',
          track_id: 'TRACK-123',
          estado_dgii: EstadoDgii.APROBADO,
        }),
      );
    });

    it('should trigger webhook with factura_rechazada on rechazado_definitivo', async () => {
      const factura = {
        id: 'factura-2',
        empresa_id: 'empresa-2',
        track_id: 'TRACK-789',
        estado_dgii: EstadoDgii.ACEPTADO,
        correlation_id: 'corr-3',
        e_ncf: 'E310000000003',
      } as FacturaElectronica;

      facturaRepo.find.mockResolvedValue([factura]);
      circuitBreaker.execute.mockResolvedValue({
        trackId: 'TRACK-789',
        estado: 'rechazado_definitivo',
        detalles: { codigo: 'ERR', mensaje: 'Rechazado' },
      });
      facturaRepo.update.mockResolvedValue({} as any);

      await service.pollEstados();

      expect(webhooksService.disparar).toHaveBeenCalledWith(
        'empresa-2',
        'factura_rechazada',
        expect.objectContaining({
          factura_id: 'factura-2',
          estado_dgii: EstadoDgii.RECHAZADO_DEFINITIVO,
        }),
      );
    });

    it('should continue processing other facturas when one fails', async () => {
      const factura1 = {
        id: 'factura-1',
        empresa_id: 'empresa-1',
        track_id: 'TRACK-111',
        estado_dgii: EstadoDgii.ACEPTADO,
        correlation_id: 'corr-1',
        e_ncf: 'E310000000001',
      } as FacturaElectronica;

      const factura2 = {
        id: 'factura-2',
        empresa_id: 'empresa-2',
        track_id: 'TRACK-222',
        estado_dgii: EstadoDgii.ACEPTADO,
        correlation_id: 'corr-2',
        e_ncf: 'E310000000002',
      } as FacturaElectronica;

      facturaRepo.find.mockResolvedValue([factura1, factura2]);
      
      // First call fails, second succeeds
      circuitBreaker.execute
        .mockRejectedValueOnce(new Error('DGII unreachable'))
        .mockResolvedValueOnce({
          trackId: 'TRACK-222',
          estado: 'aprobado',
          detalles: {},
        });

      facturaRepo.update.mockResolvedValue({} as any);

      await service.pollEstados();

      // The second factura should still be processed
      expect(facturaRepo.update).toHaveBeenCalledWith('factura-2', {
        estado_dgii: EstadoDgii.APROBADO,
      });
    });

    it('should not trigger webhook if disparar fails (graceful handling)', async () => {
      const factura = {
        id: 'factura-1',
        empresa_id: 'empresa-1',
        track_id: 'TRACK-123',
        estado_dgii: EstadoDgii.ACEPTADO,
        correlation_id: 'corr-1',
        e_ncf: 'E310000000001',
      } as FacturaElectronica;

      facturaRepo.find.mockResolvedValue([factura]);
      circuitBreaker.execute.mockResolvedValue({
        trackId: 'TRACK-123',
        estado: 'aprobado',
        detalles: {},
      });
      facturaRepo.update.mockResolvedValue({} as any);
      webhooksService.disparar.mockRejectedValue(new Error('Webhook delivery failed'));

      // Should not throw
      await expect(service.pollEstados()).resolves.not.toThrow();

      // Update should have been called (state updated despite webhook failure)
      expect(facturaRepo.update).toHaveBeenCalled();
    });
  });

  describe('getPollingIntervalMs', () => {
    it('should return the configured polling interval', () => {
      expect(service.getPollingIntervalMs()).toBe(300000);
    });
  });

  describe('consultarEstadoFactura', () => {
    it('should handle DGII unreachability gracefully (Req 29.4)', async () => {
      const factura = {
        id: 'factura-1',
        empresa_id: 'empresa-1',
        track_id: 'TRACK-123',
        estado_dgii: EstadoDgii.ACEPTADO,
        correlation_id: 'corr-1',
      } as FacturaElectronica;

      tokenService.obtenerToken.mockRejectedValue(
        new Error('DGII unreachable'),
      );

      // Should not throw - just logs the error
      await expect(
        service.consultarEstadoFactura(factura),
      ).resolves.not.toThrow();

      // Should not update anything
      expect(facturaRepo.update).not.toHaveBeenCalled();
    });
  });
});
