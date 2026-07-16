import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { DataSource, Repository, SelectQueryBuilder, EntityManager } from 'typeorm';

import { SecuenciasNcfService } from './secuencias-ncf.service.js';
import { SecuenciaNcf } from '../../database/entities/secuencia-ncf.entity.js';

describe('SecuenciasNcfService', () => {
  let service: SecuenciasNcfService;
  let repo: jest.Mocked<Partial<Repository<SecuenciaNcf>>>;
  let dataSource: jest.Mocked<Partial<DataSource>>;

  const empresaId = 'empresa-uuid-1';

  const mockSecuencia: SecuenciaNcf = {
    id: 'seq-uuid-1',
    empresa_id: empresaId,
    empresa: {} as any,
    tipo_comprobante: 'E31',
    prefijo: 'E310000001',
    numero_inicio: '1',
    numero_fin: '1000',
    numero_actual: '1',
    activo: true,
    created_at: new Date('2024-01-01'),
    updated_at: new Date('2024-01-01'),
  };

  beforeEach(async () => {
    repo = {
      create: jest.fn(),
      save: jest.fn(),
      find: jest.fn(),
      findOne: jest.fn(),
    };

    dataSource = {
      transaction: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SecuenciasNcfService,
        { provide: getRepositoryToken(SecuenciaNcf), useValue: repo },
        { provide: DataSource, useValue: dataSource },
      ],
    }).compile();

    service = module.get<SecuenciasNcfService>(SecuenciasNcfService);
  });

  describe('create', () => {
    it('should create a secuencia with numero_actual = numero_inicio', async () => {
      const dto = {
        tipo_comprobante: 'E31' as const,
        prefijo: 'E310000001',
        numero_inicio: 1,
        numero_fin: 1000,
      };

      repo.create!.mockReturnValue(mockSecuencia);
      repo.save!.mockResolvedValue(mockSecuencia);

      const result = await service.create(empresaId, dto);

      expect(repo.create).toHaveBeenCalledWith({
        empresa_id: empresaId,
        tipo_comprobante: 'E31',
        prefijo: 'E310000001',
        numero_inicio: '1',
        numero_fin: '1000',
        numero_actual: '1',
        activo: true,
      });
      expect(repo.save).toHaveBeenCalledWith(mockSecuencia);
      expect(result).toEqual(mockSecuencia);
    });
  });

  describe('list', () => {
    it('should return secuencias with restantes field', async () => {
      const secuencias = [
        { ...mockSecuencia, numero_actual: '50' },
        { ...mockSecuencia, id: 'seq-uuid-2', numero_actual: '1000' },
      ];
      repo.find!.mockResolvedValue(secuencias);

      const result = await service.list(empresaId);

      expect(repo.find).toHaveBeenCalledWith({
        where: { empresa_id: empresaId },
        order: { created_at: 'DESC' },
      });
      expect(result[0].restantes).toBe(951); // 1000 - 50 + 1
      expect(result[1].restantes).toBe(1); // 1000 - 1000 + 1
    });
  });

  describe('deactivate', () => {
    it('should set activo to false', async () => {
      const secuencia = { ...mockSecuencia, activo: true };
      repo.findOne!.mockResolvedValue(secuencia);
      repo.save!.mockResolvedValue({ ...secuencia, activo: false });

      const result = await service.deactivate('seq-uuid-1', empresaId);

      expect(repo.findOne).toHaveBeenCalledWith({
        where: { id: 'seq-uuid-1', empresa_id: empresaId },
      });
      expect(secuencia.activo).toBe(false);
      expect(repo.save).toHaveBeenCalledWith(secuencia);
    });

    it('should throw NotFoundException when secuencia not found', async () => {
      repo.findOne!.mockResolvedValue(null);

      await expect(service.deactivate('nonexistent', empresaId)).rejects.toThrow(NotFoundException);
    });
  });

  describe('getEstado', () => {
    it('should return estado with porcentaje_usado and restantes', async () => {
      const secuencias = [
        { ...mockSecuencia, numero_inicio: '1', numero_fin: '100', numero_actual: '51' },
      ];
      repo.find!.mockResolvedValue(secuencias);

      const result = await service.getEstado(empresaId);

      expect(result).toHaveLength(1);
      expect(result[0].restantes).toBe(50); // 100 - 51 + 1
      expect(result[0].porcentaje_usado).toBe(50); // (51-1)/(100-1+1) = 50/100 = 50%
      expect(result[0].tipo_comprobante).toBe('E31');
    });

    it('should only return active sequences', async () => {
      repo.find!.mockResolvedValue([]);

      const result = await service.getEstado(empresaId);

      expect(repo.find).toHaveBeenCalledWith({
        where: { empresa_id: empresaId, activo: true },
        order: { tipo_comprobante: 'ASC' },
      });
      expect(result).toHaveLength(0);
    });
  });

  describe('asignarSiguiente', () => {
    it('should return formatted e-NCF and increment numero_actual', async () => {
      const secuencia = { ...mockSecuencia, numero_actual: '42' };

      const mockManager = {
        createQueryBuilder: jest.fn().mockReturnValue({
          setLock: jest.fn().mockReturnThis(),
          where: jest.fn().mockReturnThis(),
          andWhere: jest.fn().mockReturnThis(),
          getOne: jest.fn().mockResolvedValue(secuencia),
        }),
        save: jest.fn().mockResolvedValue(secuencia),
      };

      (dataSource.transaction as jest.Mock).mockImplementation(
        async (cb: (manager: EntityManager) => Promise<any>) => {
          return cb(mockManager as unknown as EntityManager);
        },
      );

      const result = await service.asignarSiguiente(empresaId, 'E31');

      expect(result.e_ncf).toBe('E31000000100000042');
      expect(secuencia.numero_actual).toBe('43');
      expect(mockManager.save).toHaveBeenCalled();
    });

    it('should throw ConflictException when no active sequence exists', async () => {
      const mockManager = {
        createQueryBuilder: jest.fn().mockReturnValue({
          setLock: jest.fn().mockReturnThis(),
          where: jest.fn().mockReturnThis(),
          andWhere: jest.fn().mockReturnThis(),
          getOne: jest.fn().mockResolvedValue(null),
        }),
      };

      (dataSource.transaction as jest.Mock).mockImplementation(
        async (cb: (manager: EntityManager) => Promise<any>) => {
          return cb(mockManager as unknown as EntityManager);
        },
      );

      await expect(service.asignarSiguiente(empresaId, 'E31')).rejects.toThrow(ConflictException);
    });

    it('should throw ConflictException when sequence is exhausted', async () => {
      const secuencia = { ...mockSecuencia, numero_actual: '1001', numero_fin: '1000' };

      const mockManager = {
        createQueryBuilder: jest.fn().mockReturnValue({
          setLock: jest.fn().mockReturnThis(),
          where: jest.fn().mockReturnThis(),
          andWhere: jest.fn().mockReturnThis(),
          getOne: jest.fn().mockResolvedValue(secuencia),
        }),
      };

      (dataSource.transaction as jest.Mock).mockImplementation(
        async (cb: (manager: EntityManager) => Promise<any>) => {
          return cb(mockManager as unknown as EntityManager);
        },
      );

      await expect(service.asignarSiguiente(empresaId, 'E31')).rejects.toThrow(ConflictException);
    });

    it('should log warning when sequence reaches 90% usage', async () => {
      // numero_inicio=1, numero_fin=100, umbral90 = 1 + floor(0.9 * 99) = 1 + 89 = 90
      // actual=91 >= 90 => should warn
      const secuencia = {
        ...mockSecuencia,
        numero_inicio: '1',
        numero_fin: '100',
        numero_actual: '91',
      };

      const mockManager = {
        createQueryBuilder: jest.fn().mockReturnValue({
          setLock: jest.fn().mockReturnThis(),
          where: jest.fn().mockReturnThis(),
          andWhere: jest.fn().mockReturnThis(),
          getOne: jest.fn().mockResolvedValue(secuencia),
        }),
        save: jest.fn().mockResolvedValue(secuencia),
      };

      (dataSource.transaction as jest.Mock).mockImplementation(
        async (cb: (manager: EntityManager) => Promise<any>) => {
          return cb(mockManager as unknown as EntityManager);
        },
      );

      const warnSpy = jest.spyOn((service as any).logger, 'warn');

      await service.asignarSiguiente(empresaId, 'E31');

      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('90%'));
    });

    it('should NOT log warning when below 90% usage', async () => {
      // numero_inicio=1, numero_fin=100, umbral90 = 90
      // actual=50 < 90 => no warning
      const secuencia = {
        ...mockSecuencia,
        numero_inicio: '1',
        numero_fin: '100',
        numero_actual: '50',
      };

      const mockManager = {
        createQueryBuilder: jest.fn().mockReturnValue({
          setLock: jest.fn().mockReturnThis(),
          where: jest.fn().mockReturnThis(),
          andWhere: jest.fn().mockReturnThis(),
          getOne: jest.fn().mockResolvedValue(secuencia),
        }),
        save: jest.fn().mockResolvedValue(secuencia),
      };

      (dataSource.transaction as jest.Mock).mockImplementation(
        async (cb: (manager: EntityManager) => Promise<any>) => {
          return cb(mockManager as unknown as EntityManager);
        },
      );

      const warnSpy = jest.spyOn((service as any).logger, 'warn');

      await service.asignarSiguiente(empresaId, 'E31');

      expect(warnSpy).not.toHaveBeenCalled();
    });

    it('should format e-NCF correctly with padded number', async () => {
      const secuencia = {
        ...mockSecuencia,
        prefijo: 'E310000001',
        numero_actual: '5',
      };

      const mockManager = {
        createQueryBuilder: jest.fn().mockReturnValue({
          setLock: jest.fn().mockReturnThis(),
          where: jest.fn().mockReturnThis(),
          andWhere: jest.fn().mockReturnThis(),
          getOne: jest.fn().mockResolvedValue(secuencia),
        }),
        save: jest.fn().mockResolvedValue(secuencia),
      };

      (dataSource.transaction as jest.Mock).mockImplementation(
        async (cb: (manager: EntityManager) => Promise<any>) => {
          return cb(mockManager as unknown as EntityManager);
        },
      );

      const result = await service.asignarSiguiente(empresaId, 'E31');

      // prefijo + padStart(8, '0') of numero_actual
      expect(result.e_ncf).toBe('E31000000100000005');
    });
  });
});
