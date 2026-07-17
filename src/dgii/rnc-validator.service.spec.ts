import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { HttpException, HttpStatus } from '@nestjs/common';

import { RncValidatorService } from './rnc-validator.service.js';
import { REDIS_CLIENT } from '../common/guards/rate-limit.guard.js';
import type { Empresa } from '../database/entities/empresa.entity.js';

// Mock fetch globally
const mockFetch = jest.fn();
global.fetch = mockFetch as unknown as typeof fetch;

describe('RncValidatorService', () => {
  let service: RncValidatorService;
  let mockRedis: {
    get: jest.Mock;
    set: jest.Mock;
  };

  beforeEach(async () => {
    mockRedis = {
      get: jest.fn().mockResolvedValue(null),
      set: jest.fn().mockResolvedValue('OK'),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RncValidatorService,
        {
          provide: REDIS_CLIENT,
          useValue: mockRedis,
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn().mockReturnValue('https://dgii.gov.do/api/rnc'),
          },
        },
      ],
    }).compile();

    service = module.get<RncValidatorService>(RncValidatorService);
    jest.clearAllMocks();
    mockRedis.get.mockResolvedValue(null);
    mockRedis.set.mockResolvedValue('OK');
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('validarRnc', () => {
    it('should return cached result from Redis when available', async () => {
      const cachedResult = {
        rnc: '123456789',
        nombre_contribuyente: 'Empresa Test SRL',
        estado: 'activo',
        tipo_contribuyente: 'persona_juridica',
        validado: true,
      };
      mockRedis.get.mockResolvedValue(JSON.stringify(cachedResult));

      const result = await service.validarRnc('123456789');

      expect(result).toEqual(cachedResult);
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should query DGII when RNC is not cached', async () => {
      const dgiiResponse = {
        nombre_contribuyente: 'Empresa Nueva SRL',
        estado: 'activo',
        tipo_contribuyente: 'persona_juridica',
      };

      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve(dgiiResponse),
      });

      const result = await service.validarRnc('987654321');

      expect(result).toEqual({
        rnc: '987654321',
        nombre_contribuyente: 'Empresa Nueva SRL',
        estado: 'activo',
        tipo_contribuyente: 'persona_juridica',
        validado: true,
      });
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('should cache successful DGII response in Redis with 24h TTL', async () => {
      const dgiiResponse = {
        nombre_contribuyente: 'Cached SRL',
        estado: 'activo',
        tipo_contribuyente: 'persona_juridica',
      };

      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve(dgiiResponse),
      });

      await service.validarRnc('111222333');

      expect(mockRedis.set).toHaveBeenCalledWith(
        'rnc_cache:111222333',
        expect.any(String),
        'EX',
        86400,
      );
    });

    it('should return validado=false when DGII is unreachable (network error)', async () => {
      mockFetch.mockRejectedValue(new Error('ECONNREFUSED'));

      const result = await service.validarRnc('123456789');

      expect(result).toEqual({
        rnc: '123456789',
        validado: false,
        motivo: expect.stringContaining('ECONNREFUSED'),
      });
    });

    it('should return validado=false when DGII returns server error (5xx)', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        json: () => Promise.resolve({}),
      });

      const result = await service.validarRnc('123456789');

      expect(result).toEqual({
        rnc: '123456789',
        validado: false,
        motivo: expect.stringContaining('HTTP 500'),
      });
    });

    it('should throw 422 when RNC is not found (404)', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 404,
        json: () => Promise.resolve({}),
      });

      await expect(service.validarRnc('000000000')).rejects.toThrow(HttpException);

      try {
        await service.validarRnc('000000000');
      } catch (error) {
        expect(error).toBeInstanceOf(HttpException);
        expect((error as HttpException).getStatus()).toBe(HttpStatus.UNPROCESSABLE_ENTITY);
      }
    });

    it('should handle Redis failure gracefully (proceed without cache)', async () => {
      mockRedis.get.mockRejectedValue(new Error('Redis connection refused'));

      const dgiiResponse = {
        nombre_contribuyente: 'Test SRL',
        estado: 'activo',
        tipo_contribuyente: 'persona_juridica',
      };
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve(dgiiResponse),
      });

      const result = await service.validarRnc('123456789');

      expect(result).toEqual({
        rnc: '123456789',
        nombre_contribuyente: 'Test SRL',
        estado: 'activo',
        tipo_contribuyente: 'persona_juridica',
        validado: true,
      });
    });

    it('should handle Redis set failure gracefully', async () => {
      mockRedis.set.mockRejectedValue(new Error('Redis write error'));

      const dgiiResponse = {
        nombre_contribuyente: 'Test SRL',
        estado: 'activo',
        tipo_contribuyente: 'persona_juridica',
      };
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve(dgiiResponse),
      });

      // Should not throw, just logs warning
      const result = await service.validarRnc('123456789');
      expect(result).toMatchObject({ validado: true });
    });
  });

  describe('validarRncParaFactura', () => {
    const createEmpresa = (validar: boolean): Empresa =>
      ({
        id: 'empresa-123',
        validar_rnc_receptor: validar,
      }) as unknown as Empresa;

    it('should skip validation when empresa has validar_rnc_receptor=false', async () => {
      const empresa = createEmpresa(false);

      const result = await service.validarRncParaFactura('123456789', empresa);

      expect(result).toEqual({ rnc_validado: false });
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should return rnc_validado=true when RNC is active', async () => {
      const empresa = createEmpresa(true);

      const dgiiResponse = {
        nombre_contribuyente: 'Empresa Activa SRL',
        estado: 'activo',
        tipo_contribuyente: 'persona_juridica',
      };
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve(dgiiResponse),
      });

      const result = await service.validarRncParaFactura('123456789', empresa);

      expect(result).toEqual({ rnc_validado: true });
    });

    it('should throw 422 when RNC is inactive', async () => {
      const empresa = createEmpresa(true);

      const dgiiResponse = {
        nombre_contribuyente: 'Empresa Inactiva SRL',
        estado: 'inactivo',
        tipo_contribuyente: 'persona_juridica',
      };
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve(dgiiResponse),
      });

      await expect(
        service.validarRncParaFactura('123456789', empresa),
      ).rejects.toThrow(HttpException);

      try {
        await service.validarRncParaFactura('123456789', empresa);
      } catch (error) {
        expect(error).toBeInstanceOf(HttpException);
        const httpError = error as HttpException;
        expect(httpError.getStatus()).toBe(HttpStatus.UNPROCESSABLE_ENTITY);
        const response = httpError.getResponse() as Record<string, unknown>;
        expect(response.message).toContain('inactivo');
      }
    });

    it('should throw 422 when RNC is suspended', async () => {
      const empresa = createEmpresa(true);

      const dgiiResponse = {
        nombre_contribuyente: 'Empresa Suspendida SRL',
        estado: 'suspendido',
        tipo_contribuyente: 'persona_juridica',
      };
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve(dgiiResponse),
      });

      await expect(
        service.validarRncParaFactura('123456789', empresa),
      ).rejects.toThrow(HttpException);
    });

    it('should return rnc_validado=false when DGII is unreachable', async () => {
      const empresa = createEmpresa(true);
      mockFetch.mockRejectedValue(new Error('Timeout'));

      const result = await service.validarRncParaFactura('123456789', empresa);

      expect(result).toEqual({ rnc_validado: false });
    });
  });
});
