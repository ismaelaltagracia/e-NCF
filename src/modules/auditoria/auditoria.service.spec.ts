import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { AuditoriaService } from './auditoria.service.js';
import { Auditoria } from '../../database/entities/auditoria.entity.js';
import type { RegistrarAuditoriaDto } from './dto/auditoria.schemas.js';

describe('AuditoriaService', () => {
  let service: AuditoriaService;
  let repo: jest.Mocked<Partial<Repository<Auditoria>>>;

  const mockQueryBuilder = {
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    skip: jest.fn().mockReturnThis(),
    take: jest.fn().mockReturnThis(),
    getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
  };

  beforeEach(async () => {
    repo = {
      create: jest.fn(),
      save: jest.fn(),
      createQueryBuilder: jest.fn().mockReturnValue(mockQueryBuilder) as any,
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuditoriaService,
        {
          provide: getRepositoryToken(Auditoria),
          useValue: repo,
        },
      ],
    }).compile();

    service = module.get<AuditoriaService>(AuditoriaService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('registrar', () => {
    it('debe crear y guardar un registro de auditoría', async () => {
      const dto: RegistrarAuditoriaDto = {
        empresa_id: 'emp-uuid-1',
        usuario_id: 'user-uuid-1',
        api_key_id: null,
        accion: 'factura_enviada',
        recurso_tipo: 'factura',
        recurso_id: 'factura-uuid-1',
        datos_anteriores: null,
        datos_nuevos: { estado: 'enviado' },
        ip_origen: '192.168.1.1',
        correlation_id: 'corr-uuid-1',
      };

      const mockAuditoria = { id: 'audit-uuid-1', ...dto, created_at: new Date() };
      (repo.create as jest.Mock).mockReturnValue(mockAuditoria);
      (repo.save as jest.Mock).mockResolvedValue(mockAuditoria);

      const result = await service.registrar(dto);

      expect(repo.create).toHaveBeenCalledWith({
        empresa_id: dto.empresa_id,
        usuario_id: dto.usuario_id,
        api_key_id: null,
        accion: dto.accion,
        recurso_tipo: dto.recurso_tipo,
        recurso_id: dto.recurso_id,
        datos_anteriores: null,
        datos_nuevos: dto.datos_nuevos,
        ip_origen: dto.ip_origen,
        correlation_id: dto.correlation_id,
      });
      expect(repo.save).toHaveBeenCalledWith(mockAuditoria);
      expect(result).toEqual(mockAuditoria);
    });

    it('debe manejar campos opcionales como null', async () => {
      const dto: RegistrarAuditoriaDto = {
        accion: 'usuario_creado',
        recurso_tipo: 'usuario',
      };

      const mockAuditoria = { id: 'audit-uuid-2', ...dto, created_at: new Date() };
      (repo.create as jest.Mock).mockReturnValue(mockAuditoria);
      (repo.save as jest.Mock).mockResolvedValue(mockAuditoria);

      await service.registrar(dto);

      expect(repo.create).toHaveBeenCalledWith({
        empresa_id: null,
        usuario_id: null,
        api_key_id: null,
        accion: 'usuario_creado',
        recurso_tipo: 'usuario',
        recurso_id: null,
        datos_anteriores: null,
        datos_nuevos: null,
        ip_origen: null,
        correlation_id: null,
      });
    });
  });

  describe('listar', () => {
    it('debe listar registros paginados filtrados por empresa_id', async () => {
      const mockData = [
        { id: 'a1', accion: 'factura_enviada', created_at: new Date() },
      ];
      mockQueryBuilder.getManyAndCount.mockResolvedValue([mockData, 1]);

      const result = await service.listar('emp-uuid-1', {
        page: 1,
        limit: 20,
      });

      expect(mockQueryBuilder.where).toHaveBeenCalledWith(
        'auditoria.empresa_id = :empresaId',
        { empresaId: 'emp-uuid-1' },
      );
      expect(mockQueryBuilder.orderBy).toHaveBeenCalledWith('auditoria.created_at', 'DESC');
      expect(mockQueryBuilder.skip).toHaveBeenCalledWith(0);
      expect(mockQueryBuilder.take).toHaveBeenCalledWith(20);
      expect(result).toEqual({
        data: mockData,
        total: 1,
        page: 1,
        limit: 20,
        totalPages: 1,
      });
    });

    it('debe aplicar filtro por accion', async () => {
      mockQueryBuilder.getManyAndCount.mockResolvedValue([[], 0]);

      await service.listar('emp-uuid-1', {
        accion: 'factura_anulada',
        page: 1,
        limit: 20,
      });

      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
        'auditoria.accion = :accion',
        { accion: 'factura_anulada' },
      );
    });

    it('debe aplicar filtros de fecha', async () => {
      mockQueryBuilder.getManyAndCount.mockResolvedValue([[], 0]);

      await service.listar('emp-uuid-1', {
        fecha_desde: '2024-01-01T00:00:00.000Z',
        fecha_hasta: '2024-12-31T23:59:59.999Z',
        page: 1,
        limit: 20,
      });

      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
        'auditoria.created_at >= :fechaDesde',
        { fechaDesde: '2024-01-01T00:00:00.000Z' },
      );
      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
        'auditoria.created_at <= :fechaHasta',
        { fechaHasta: '2024-12-31T23:59:59.999Z' },
      );
    });

    it('debe aplicar filtro por usuario_id', async () => {
      mockQueryBuilder.getManyAndCount.mockResolvedValue([[], 0]);

      await service.listar('emp-uuid-1', {
        usuario_id: 'user-uuid-1',
        page: 1,
        limit: 20,
      });

      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
        'auditoria.usuario_id = :usuarioId',
        { usuarioId: 'user-uuid-1' },
      );
    });

    it('debe calcular paginación correctamente', async () => {
      mockQueryBuilder.getManyAndCount.mockResolvedValue([[], 50]);

      const result = await service.listar('emp-uuid-1', {
        page: 3,
        limit: 10,
      });

      expect(mockQueryBuilder.skip).toHaveBeenCalledWith(20);
      expect(mockQueryBuilder.take).toHaveBeenCalledWith(10);
      expect(result.totalPages).toBe(5);
    });
  });

  describe('listarGlobal', () => {
    it('debe listar registros cross-empresa sin filtro de empresa', async () => {
      mockQueryBuilder.getManyAndCount.mockResolvedValue([[], 0]);

      await service.listarGlobal({ page: 1, limit: 20 });

      expect(mockQueryBuilder.where).not.toHaveBeenCalled();
      expect(mockQueryBuilder.orderBy).toHaveBeenCalledWith('auditoria.created_at', 'DESC');
    });

    it('debe aplicar filtro de empresa_id si se proporciona', async () => {
      mockQueryBuilder.getManyAndCount.mockResolvedValue([[], 0]);

      await service.listarGlobal({
        empresa_id: 'emp-uuid-2',
        page: 1,
        limit: 20,
      });

      expect(mockQueryBuilder.where).toHaveBeenCalledWith(
        'auditoria.empresa_id = :empresaId',
        { empresaId: 'emp-uuid-2' },
      );
    });

    it('debe aplicar todos los filtros combinados', async () => {
      mockQueryBuilder.getManyAndCount.mockResolvedValue([[], 0]);

      await service.listarGlobal({
        empresa_id: 'emp-uuid-2',
        accion: 'certificado_subido',
        usuario_id: 'user-uuid-2',
        fecha_desde: '2024-06-01T00:00:00.000Z',
        page: 2,
        limit: 15,
      });

      expect(mockQueryBuilder.where).toHaveBeenCalledWith(
        'auditoria.empresa_id = :empresaId',
        { empresaId: 'emp-uuid-2' },
      );
      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
        'auditoria.accion = :accion',
        { accion: 'certificado_subido' },
      );
      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
        'auditoria.usuario_id = :usuarioId',
        { usuarioId: 'user-uuid-2' },
      );
      expect(mockQueryBuilder.skip).toHaveBeenCalledWith(15);
      expect(mockQueryBuilder.take).toHaveBeenCalledWith(15);
    });
  });
});
