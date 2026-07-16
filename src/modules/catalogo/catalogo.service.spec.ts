import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException, ForbiddenException } from '@nestjs/common';
import { CatalogoService } from './catalogo.service.js';
import { CatalogoItem } from '../../database/entities/catalogo-item.entity.js';
import { TipoCatalogo } from '../../database/enums.js';

describe('CatalogoService', () => {
  let service: CatalogoService;
  let mockRepo: Record<string, jest.Mock>;
  let mockQueryBuilder: Record<string, jest.Mock>;

  beforeEach(async () => {
    mockQueryBuilder = {
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([]),
    };

    mockRepo = {
      create: jest.fn(),
      save: jest.fn(),
      findOne: jest.fn(),
      createQueryBuilder: jest.fn().mockReturnValue(mockQueryBuilder),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CatalogoService,
        {
          provide: getRepositoryToken(CatalogoItem),
          useValue: mockRepo,
        },
      ],
    }).compile();

    service = module.get<CatalogoService>(CatalogoService);
  });

  describe('create', () => {
    it('should create a catalogo item with correct data', async () => {
      const dto = {
        tipo: TipoCatalogo.PRODUCTO,
        codigo: 'PROD-001',
        descripcion: 'Producto de prueba',
        precio_unitario: 150.5,
        tasa_itbis: 18,
      };

      const empresaId = 'empresa-uuid-123';
      const createdItem = { id: 'item-uuid', empresa_id: empresaId, ...dto, activo: true };

      mockRepo.create.mockReturnValue(createdItem);
      mockRepo.save.mockResolvedValue(createdItem);

      const result = await service.create(empresaId, dto);

      expect(mockRepo.create).toHaveBeenCalledWith({
        empresa_id: empresaId,
        tipo: TipoCatalogo.PRODUCTO,
        codigo: 'PROD-001',
        descripcion: 'Producto de prueba',
        precio_unitario: '150.50',
        tasa_itbis: 18,
        activo: true,
      });
      expect(mockRepo.save).toHaveBeenCalledWith(createdItem);
      expect(result).toEqual(createdItem);
    });

    it('should format precio_unitario to 2 decimal places', async () => {
      const dto = {
        tipo: TipoCatalogo.SERVICIO,
        codigo: 'SRV-001',
        descripcion: 'Servicio',
        precio_unitario: 100,
        tasa_itbis: 0,
      };

      const empresaId = 'empresa-uuid';
      mockRepo.create.mockReturnValue({});
      mockRepo.save.mockResolvedValue({});

      await service.create(empresaId, dto);

      expect(mockRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ precio_unitario: '100.00' }),
      );
    });
  });

  describe('list', () => {
    it('should filter by empresa_id', async () => {
      const empresaId = 'empresa-uuid';

      await service.list(empresaId, {});

      expect(mockQueryBuilder.where).toHaveBeenCalledWith('item.empresa_id = :empresaId', {
        empresaId,
      });
    });

    it('should apply tipo filter when provided', async () => {
      await service.list('empresa-uuid', { tipo: TipoCatalogo.PRODUCTO });

      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith('item.tipo = :tipo', {
        tipo: TipoCatalogo.PRODUCTO,
      });
    });

    it('should apply activo filter when provided', async () => {
      await service.list('empresa-uuid', { activo: true });

      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith('item.activo = :activo', {
        activo: true,
      });
    });

    it('should apply ILIKE search on descripcion and codigo', async () => {
      await service.list('empresa-uuid', { search: 'test' });

      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
        '(item.descripcion ILIKE :search OR item.codigo ILIKE :search)',
        { search: '%test%' },
      );
    });

    it('should not apply optional filters when not provided', async () => {
      await service.list('empresa-uuid', {});

      expect(mockQueryBuilder.andWhere).not.toHaveBeenCalled();
    });

    it('should order by created_at DESC', async () => {
      await service.list('empresa-uuid', {});

      expect(mockQueryBuilder.orderBy).toHaveBeenCalledWith('item.created_at', 'DESC');
    });
  });

  describe('update', () => {
    it('should update item fields', async () => {
      const existingItem = {
        id: 'item-uuid',
        empresa_id: 'empresa-uuid',
        tipo: TipoCatalogo.PRODUCTO,
        codigo: 'OLD',
        descripcion: 'Old desc',
        precio_unitario: '10.00',
        tasa_itbis: 18,
        activo: true,
      };

      mockRepo.findOne.mockResolvedValue({ ...existingItem });
      mockRepo.save.mockImplementation((item: any) => Promise.resolve(item));

      const result = await service.update('item-uuid', 'empresa-uuid', {
        codigo: 'NEW',
        precio_unitario: 25.99,
      });

      expect(result.codigo).toBe('NEW');
      expect(result.precio_unitario).toBe('25.99');
    });

    it('should throw NotFoundException when item does not exist', async () => {
      mockRepo.findOne.mockResolvedValue(null);

      await expect(service.update('nonexistent', 'empresa-uuid', { codigo: 'X' })).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw ForbiddenException for cross-tenant update', async () => {
      mockRepo.findOne.mockResolvedValue({
        id: 'item-uuid',
        empresa_id: 'another-empresa',
      });

      await expect(service.update('item-uuid', 'my-empresa', { codigo: 'X' })).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('should not modify fields not included in dto', async () => {
      const existingItem = {
        id: 'item-uuid',
        empresa_id: 'empresa-uuid',
        tipo: TipoCatalogo.PRODUCTO,
        codigo: 'ORIG',
        descripcion: 'Original',
        precio_unitario: '50.00',
        tasa_itbis: 16,
        activo: true,
      };

      mockRepo.findOne.mockResolvedValue({ ...existingItem });
      mockRepo.save.mockImplementation((item: any) => Promise.resolve(item));

      const result = await service.update('item-uuid', 'empresa-uuid', {
        descripcion: 'Updated',
      });

      expect(result.codigo).toBe('ORIG');
      expect(result.descripcion).toBe('Updated');
      expect(result.tasa_itbis).toBe(16);
    });
  });

  describe('softDelete', () => {
    it('should set activo to false', async () => {
      const existingItem = {
        id: 'item-uuid',
        empresa_id: 'empresa-uuid',
        activo: true,
      };

      mockRepo.findOne.mockResolvedValue(existingItem);
      mockRepo.save.mockResolvedValue({ ...existingItem, activo: false });

      await service.softDelete('item-uuid', 'empresa-uuid');

      expect(mockRepo.save).toHaveBeenCalledWith(expect.objectContaining({ activo: false }));
    });

    it('should throw NotFoundException when item does not exist', async () => {
      mockRepo.findOne.mockResolvedValue(null);

      await expect(service.softDelete('nonexistent', 'empresa-uuid')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw ForbiddenException for cross-tenant delete', async () => {
      mockRepo.findOne.mockResolvedValue({
        id: 'item-uuid',
        empresa_id: 'another-empresa',
      });

      await expect(service.softDelete('item-uuid', 'my-empresa')).rejects.toThrow(
        ForbiddenException,
      );
    });
  });
});
