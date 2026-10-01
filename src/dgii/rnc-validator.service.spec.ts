import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { getRepositoryToken } from '@nestjs/typeorm';
import { HttpException, HttpStatus } from '@nestjs/common';

import { RncValidatorService } from './rnc-validator.service.js';
import { REDIS_CLIENT } from '../common/guards/rate-limit.guard.js';
import { RncContribuyente } from '../database/entities/rnc-contribuyente.entity.js';
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
  let mockRncRepo: {
    findOne: jest.Mock;
  };

  beforeEach(async () => {
    mockRedis = {
      get: jest.fn().mockResolvedValue(null),
      set: jest.fn().mockResolvedValue('OK'),
    };
    mockRncRepo = {
      findOne: jest.fn().mockResolvedValue(null),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RncValidatorService,
        {
          provide: REDIS_CLIENT,
          useValue: mockRedis,
        },
        {
          provide: getRepositoryToken(RncContribuyente),
          useValue: mockRncRepo,
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
    mockRncRepo.findOne.mockResolvedValue(null);
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

    it('should query the local contribuyentes table when RNC is not cached', async () => {
      mockRncRepo.findOne.mockResolvedValue({
        rnc: '987654321',
        razon_social: 'Empresa Nueva SRL',
        estado: 'ACTIVO',
      });

      const result = await service.validarRnc('987654321');

      expect(result).toEqual({
        rnc: '987654321',
        nombre_contribuyente: 'Empresa Nueva SRL',
        estado: 'activo',
        tipo_contribuyente: 'persona_juridica',
        validado: true,
      });
      expect(mockRncRepo.findOne).toHaveBeenCalledWith({ where: { rnc: '987654321' } });
    });

    it('should cache successful result in Redis with 24h TTL', async () => {
      mockRncRepo.findOne.mockResolvedValue({
        rnc: '111222333',
        razon_social: 'Cached SRL',
        estado: 'ACTIVO',
      });

      await service.validarRnc('111222333');

      expect(mockRedis.set).toHaveBeenCalledWith(
        'rnc_cache:111222333',
        expect.any(String),
        'EX',
        86400,
      );
    });

    it('should throw 422 when RNC is not found in the local table', async () => {
      mockRncRepo.findOne.mockResolvedValue(null);

      await expect(service.validarRnc('000000000')).rejects.toThrow(HttpException);

      try {
        await service.validarRnc('000000000');
      } catch (error) {
        expect(error).toBeInstanceOf(HttpException);
        expect((error as HttpException).getStatus()).toBe(HttpStatus.UNPROCESSABLE_ENTITY);
      }
    });

    it('should handle Redis read failure gracefully (proceed without cache)', async () => {
      mockRedis.get.mockRejectedValue(new Error('Redis connection refused'));
      mockRncRepo.findOne.mockResolvedValue({
        rnc: '123456789',
        razon_social: 'Test SRL',
        estado: 'ACTIVO',
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
      mockRncRepo.findOne.mockResolvedValue({
        rnc: '123456789',
        razon_social: 'Test SRL',
        estado: 'ACTIVO',
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
      mockRncRepo.findOne.mockResolvedValue({
        rnc: '123456789',
        razon_social: 'Empresa Activa SRL',
        estado: 'ACTIVO',
      });

      const result = await service.validarRncParaFactura('123456789', empresa);

      expect(result).toEqual({ rnc_validado: true });
    });

    it('should throw 422 when RNC is inactive', async () => {
      const empresa = createEmpresa(true);
      mockRncRepo.findOne.mockResolvedValue({
        rnc: '123456789',
        razon_social: 'Empresa Inactiva SRL',
        estado: 'INACTIVO',
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
      mockRncRepo.findOne.mockResolvedValue({
        rnc: '123456789',
        razon_social: 'Empresa Suspendida SRL',
        estado: 'SUSPENDIDO',
      });

      await expect(
        service.validarRncParaFactura('123456789', empresa),
      ).rejects.toThrow(HttpException);
    });

    it('should return rnc_validado=false when the lookup source is unreachable', async () => {
      const empresa = createEmpresa(true);
      // Un error de red (TypeError con "network") se trata como fuente inalcanzable.
      mockRncRepo.findOne.mockRejectedValue(new TypeError('network timeout'));

      const result = await service.validarRncParaFactura('123456789', empresa);

      expect(result).toEqual({ rnc_validado: false });
    });
  });
});
