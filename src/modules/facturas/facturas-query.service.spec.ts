import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException, ForbiddenException } from '@nestjs/common';

import { FacturasService } from './facturas.service.js';
import { FacturaElectronica } from '../../database/entities/factura-electronica.entity.js';
import { Empresa } from '../../database/entities/empresa.entity.js';
import { EstadoDgii } from '../../database/enums.js';
import { SecuenciasNcfService } from '../secuencias-ncf/secuencias-ncf.service.js';
import { PlanesService } from '../planes/planes.service.js';
import { ConversorXmlService } from '../../dgii/conversor-xml.service.js';
import { FirmaService } from '../../dgii/firma.service.js';
import { TransmisionService } from '../../dgii/transmision.service.js';
import { RncValidatorService } from '../../dgii/rnc-validator.service.js';
import { STORAGE_PROVIDER } from '../../infrastructure/storage/storage.interface.js';
import { RETRY_QUEUE_SERVICE } from '../../infrastructure/queue/retry-queue.interfaces.js';

describe('FacturasService - Query Methods', () => {
  let service: FacturasService;
  let facturaRepo: {
    findAndCount: jest.Mock;
    findOne: jest.Mock;
  };

  const empresaId = 'empresa-uuid-1';
  const otherEmpresaId = 'empresa-uuid-2';

  const mockFactura: Partial<FacturaElectronica> = {
    id: 'factura-uuid-1',
    empresa_id: empresaId,
    e_ncf: 'E310000000001',
    track_id: 'track-123',
    estado_dgii: EstadoDgii.ACEPTADO,
    payload_json: {},
    created_at: new Date('2024-01-15T10:00:00Z'),
    updated_at: new Date('2024-01-15T10:05:00Z'),
  };

  const mockFacturaOtherEmpresa: Partial<FacturaElectronica> = {
    id: 'factura-uuid-2',
    empresa_id: otherEmpresaId,
    e_ncf: 'E310000000002',
    track_id: 'track-456',
    estado_dgii: EstadoDgii.ENVIADO,
    payload_json: {},
    created_at: new Date('2024-01-15T11:00:00Z'),
    updated_at: new Date('2024-01-15T11:05:00Z'),
  };

  beforeEach(async () => {
    facturaRepo = {
      findAndCount: jest.fn(),
      findOne: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FacturasService,
        {
          provide: getRepositoryToken(FacturaElectronica),
          useValue: facturaRepo,
        },
        {
          provide: getRepositoryToken(Empresa),
          useValue: {},
        },
        {
          provide: SecuenciasNcfService,
          useValue: {},
        },
        {
          provide: PlanesService,
          useValue: {},
        },
        {
          provide: ConversorXmlService,
          useValue: {},
        },
        {
          provide: FirmaService,
          useValue: {},
        },
        {
          provide: TransmisionService,
          useValue: {},
        },
        {
          provide: RncValidatorService,
          useValue: {},
        },
        {
          provide: STORAGE_PROVIDER,
          useValue: {},
        },
        {
          provide: RETRY_QUEUE_SERVICE,
          useValue: null,
        },
      ],
    }).compile();

    service = module.get<FacturasService>(FacturasService);
  });

  describe('listarFacturas', () => {
    it('should return paginated facturas filtered by empresa_id', async () => {
      const facturas = [mockFactura];
      facturaRepo.findAndCount.mockResolvedValue([facturas, 1]);

      const result = await service.listarFacturas(empresaId, {
        page: 1,
        limit: 20,
      });

      expect(facturaRepo.findAndCount).toHaveBeenCalledWith({
        where: { empresa_id: empresaId },
        order: { created_at: 'DESC' },
        skip: 0,
        take: 20,
      });
      expect(result).toEqual({
        data: facturas,
        total: 1,
        page: 1,
        limit: 20,
        totalPages: 1,
      });
    });

    it('should calculate correct skip for page 2', async () => {
      facturaRepo.findAndCount.mockResolvedValue([[], 0]);

      await service.listarFacturas(empresaId, { page: 2, limit: 10 });

      expect(facturaRepo.findAndCount).toHaveBeenCalledWith(
        expect.objectContaining({
          skip: 10,
          take: 10,
        }),
      );
    });

    it('should filter by estado_dgii when provided', async () => {
      facturaRepo.findAndCount.mockResolvedValue([[], 0]);

      await service.listarFacturas(empresaId, {
        page: 1,
        limit: 20,
        estado_dgii: EstadoDgii.ACEPTADO,
      });

      expect(facturaRepo.findAndCount).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { empresa_id: empresaId, estado_dgii: EstadoDgii.ACEPTADO },
        }),
      );
    });

    it('should calculate totalPages correctly', async () => {
      facturaRepo.findAndCount.mockResolvedValue([[], 45]);

      const result = await service.listarFacturas(empresaId, {
        page: 1,
        limit: 20,
      });

      expect(result.totalPages).toBe(3);
    });

    it('should return empty data when no facturas exist', async () => {
      facturaRepo.findAndCount.mockResolvedValue([[], 0]);

      const result = await service.listarFacturas(empresaId, {
        page: 1,
        limit: 20,
      });

      expect(result).toEqual({
        data: [],
        total: 0,
        page: 1,
        limit: 20,
        totalPages: 0,
      });
    });
  });

  describe('obtenerFactura', () => {
    it('should return factura when it belongs to the same empresa', async () => {
      facturaRepo.findOne.mockResolvedValue(mockFactura);

      const result = await service.obtenerFactura('factura-uuid-1', empresaId);

      expect(result).toEqual(mockFactura);
      expect(facturaRepo.findOne).toHaveBeenCalledWith({
        where: { id: 'factura-uuid-1' },
      });
    });

    it('should throw NotFoundException when factura does not exist', async () => {
      facturaRepo.findOne.mockResolvedValue(null);

      await expect(
        service.obtenerFactura('non-existent-id', empresaId),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException when factura belongs to another empresa (cross-tenant)', async () => {
      facturaRepo.findOne.mockResolvedValue(mockFacturaOtherEmpresa);

      await expect(
        service.obtenerFactura('factura-uuid-2', empresaId),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('obtenerEstadoFactura', () => {
    it('should return only status fields for a valid factura', async () => {
      facturaRepo.findOne.mockResolvedValue(mockFactura);

      const result = await service.obtenerEstadoFactura('factura-uuid-1', empresaId);

      expect(result).toEqual({
        id: mockFactura.id,
        e_ncf: mockFactura.e_ncf,
        estado_dgii: mockFactura.estado_dgii,
        track_id: mockFactura.track_id,
        updated_at: mockFactura.updated_at,
      });
    });

    it('should throw NotFoundException for non-existent factura', async () => {
      facturaRepo.findOne.mockResolvedValue(null);

      await expect(
        service.obtenerEstadoFactura('non-existent-id', empresaId),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException for cross-tenant access', async () => {
      facturaRepo.findOne.mockResolvedValue(mockFacturaOtherEmpresa);

      await expect(
        service.obtenerEstadoFactura('factura-uuid-2', empresaId),
      ).rejects.toThrow(ForbiddenException);
    });
  });
});
