import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConflictException, InternalServerErrorException } from '@nestjs/common';
import { DataSource, Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';

import { OnboardingService } from './onboarding.service';
import { Empresa } from '../../database/entities/empresa.entity';
import { Usuario } from '../../database/entities/usuario.entity';
import { Plan } from '../../database/entities/plan.entity';
import { EstadoEmpresa, RolUsuario } from '../../database/enums';
import type { RegistroDto } from './dto/onboarding.schemas';

describe('OnboardingService', () => {
  let service: OnboardingService;
  let empresaRepo: jest.Mocked<Repository<Empresa>>;
  let usuarioRepo: jest.Mocked<Repository<Usuario>>;
  let planRepo: jest.Mocked<Repository<Plan>>;
  let dataSource: jest.Mocked<DataSource>;

  const mockQueryRunner = {
    connect: jest.fn(),
    startTransaction: jest.fn(),
    commitTransaction: jest.fn(),
    rollbackTransaction: jest.fn(),
    release: jest.fn(),
    manager: {
      create: jest.fn(),
      save: jest.fn(),
    },
  };

  const validDto: RegistroDto = {
    empresa_nombre: 'Empresa Test SRL',
    rnc: '123456789',
    admin_nombre: 'Admin User',
    email: 'admin@empresa.com',
    password: 'Password1',
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OnboardingService,
        {
          provide: getRepositoryToken(Empresa),
          useValue: {
            findOne: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(Usuario),
          useValue: {
            findOne: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(Plan),
          useValue: {
            findOne: jest.fn(),
          },
        },
        {
          provide: DataSource,
          useValue: {
            createQueryRunner: jest.fn().mockReturnValue(mockQueryRunner),
          },
        },
      ],
    }).compile();

    service = module.get<OnboardingService>(OnboardingService);
    empresaRepo = module.get(getRepositoryToken(Empresa));
    usuarioRepo = module.get(getRepositoryToken(Usuario));
    planRepo = module.get(getRepositoryToken(Plan));
    dataSource = module.get(DataSource);

    // Reset mocks
    jest.clearAllMocks();
    dataSource.createQueryRunner.mockReturnValue(mockQueryRunner as any);
  });

  describe('registrar', () => {
    it('should create empresa with estado "certificacion" and usuario with rol "admin"', async () => {
      empresaRepo.findOne.mockResolvedValue(null);
      usuarioRepo.findOne.mockResolvedValue(null);
      planRepo.findOne.mockResolvedValue({
        id: 'plan-uuid',
        nombre: 'Básico',
      } as Plan);

      mockQueryRunner.manager.create.mockImplementation((_EntityClass: any, data: any) => ({
        ...data,
      }));
      mockQueryRunner.manager.save.mockImplementation(async (entity: any) => ({
        ...entity,
        id: entity.rnc ? 'empresa-uuid' : 'usuario-uuid',
      }));

      const result = await service.registrar(validDto);

      expect(result.empresa_id).toBe('empresa-uuid');
      expect(result.usuario_id).toBe('usuario-uuid');

      // Verify empresa was created with correct state
      expect(mockQueryRunner.manager.create).toHaveBeenCalledWith(
        Empresa,
        expect.objectContaining({
          rnc: '123456789',
          nombre: 'Empresa Test SRL',
          estado: EstadoEmpresa.CERTIFICACION,
          plan_id: 'plan-uuid',
        }),
      );

      // Verify usuario was created with admin role
      expect(mockQueryRunner.manager.create).toHaveBeenCalledWith(
        Usuario,
        expect.objectContaining({
          nombre: 'Admin User',
          email: 'admin@empresa.com',
          rol: RolUsuario.ADMIN,
          activo: true,
        }),
      );
    });

    it('should hash password with bcrypt cost 12', async () => {
      empresaRepo.findOne.mockResolvedValue(null);
      usuarioRepo.findOne.mockResolvedValue(null);
      planRepo.findOne.mockResolvedValue(null);

      mockQueryRunner.manager.create.mockImplementation((_EntityClass: any, data: any) => ({
        ...data,
      }));
      mockQueryRunner.manager.save.mockImplementation(async (entity: any) => ({
        ...entity,
        id: entity.rnc ? 'empresa-uuid' : 'usuario-uuid',
      }));

      await service.registrar(validDto);

      // Get the password_hash used in the usuario create call
      const usuarioCreateCall = mockQueryRunner.manager.create.mock.calls.find(
        (call) => call[0] === Usuario,
      );
      const passwordHash = usuarioCreateCall![1].password_hash;

      // Verify bcrypt hash is valid and uses correct cost
      const isValid = await bcrypt.compare(validDto.password, passwordHash);
      expect(isValid).toBe(true);

      // Verify cost rounds from the hash
      const rounds = bcrypt.getRounds(passwordHash);
      expect(rounds).toBe(12);
    });

    it('should throw ConflictException if RNC already exists', async () => {
      empresaRepo.findOne.mockResolvedValue({ id: 'existing' } as Empresa);

      await expect(service.registrar(validDto)).rejects.toThrow(ConflictException);
      await expect(service.registrar(validDto)).rejects.toThrow(
        'El RNC ya se encuentra registrado',
      );
    });

    it('should throw ConflictException if email already exists', async () => {
      empresaRepo.findOne.mockResolvedValue(null);
      usuarioRepo.findOne.mockResolvedValue({ id: 'existing' } as Usuario);

      await expect(service.registrar(validDto)).rejects.toThrow(ConflictException);
      await expect(service.registrar(validDto)).rejects.toThrow(
        'El email ya se encuentra registrado',
      );
    });

    it('should assign plan "Básico" by default when found', async () => {
      empresaRepo.findOne.mockResolvedValue(null);
      usuarioRepo.findOne.mockResolvedValue(null);
      planRepo.findOne.mockResolvedValue({
        id: 'plan-basico-id',
        nombre: 'Básico',
      } as Plan);

      mockQueryRunner.manager.create.mockImplementation((_EntityClass: any, data: any) => ({
        ...data,
      }));
      mockQueryRunner.manager.save.mockImplementation(async (entity: any) => ({
        ...entity,
        id: entity.rnc ? 'empresa-uuid' : 'usuario-uuid',
      }));

      await service.registrar(validDto);

      expect(planRepo.findOne).toHaveBeenCalledWith({
        where: { nombre: 'Básico' },
      });

      expect(mockQueryRunner.manager.create).toHaveBeenCalledWith(
        Empresa,
        expect.objectContaining({
          plan_id: 'plan-basico-id',
        }),
      );
    });

    it('should set plan_id to null when plan "Básico" does not exist', async () => {
      empresaRepo.findOne.mockResolvedValue(null);
      usuarioRepo.findOne.mockResolvedValue(null);
      planRepo.findOne.mockResolvedValue(null);

      mockQueryRunner.manager.create.mockImplementation((_EntityClass: any, data: any) => ({
        ...data,
      }));
      mockQueryRunner.manager.save.mockImplementation(async (entity: any) => ({
        ...entity,
        id: entity.rnc ? 'empresa-uuid' : 'usuario-uuid',
      }));

      await service.registrar(validDto);

      expect(mockQueryRunner.manager.create).toHaveBeenCalledWith(
        Empresa,
        expect.objectContaining({
          plan_id: null,
        }),
      );
    });

    it('should rollback transaction on failure', async () => {
      empresaRepo.findOne.mockResolvedValue(null);
      usuarioRepo.findOne.mockResolvedValue(null);
      planRepo.findOne.mockResolvedValue(null);

      mockQueryRunner.manager.create.mockImplementation((_EntityClass: any, data: any) => ({
        ...data,
      }));
      mockQueryRunner.manager.save.mockRejectedValue(new Error('DB error'));

      await expect(service.registrar(validDto)).rejects.toThrow(InternalServerErrorException);

      expect(mockQueryRunner.rollbackTransaction).toHaveBeenCalled();
      expect(mockQueryRunner.release).toHaveBeenCalled();
    });

    it('should use a transaction for atomicity', async () => {
      empresaRepo.findOne.mockResolvedValue(null);
      usuarioRepo.findOne.mockResolvedValue(null);
      planRepo.findOne.mockResolvedValue(null);

      mockQueryRunner.manager.create.mockImplementation((_EntityClass: any, data: any) => ({
        ...data,
      }));
      mockQueryRunner.manager.save.mockImplementation(async (entity: any) => ({
        ...entity,
        id: entity.rnc ? 'empresa-uuid' : 'usuario-uuid',
      }));

      await service.registrar(validDto);

      expect(mockQueryRunner.connect).toHaveBeenCalled();
      expect(mockQueryRunner.startTransaction).toHaveBeenCalled();
      expect(mockQueryRunner.commitTransaction).toHaveBeenCalled();
      expect(mockQueryRunner.release).toHaveBeenCalled();
    });
  });
});
