import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { DataSource, Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';

import { UsersService } from './users.service';
import { Usuario } from '../../database/entities/usuario.entity';
import { RefreshToken } from '../../database/entities/refresh-token.entity';
import { RolUsuario, EstadoToken } from '../../database/enums';
import type { CreateUsuarioDto, UpdateUsuarioDto } from './dto/users.schemas';

describe('UsersService', () => {
  let service: UsersService;
  let usuarioRepo: jest.Mocked<Repository<Usuario>>;
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  let refreshTokenRepo: jest.Mocked<Repository<RefreshToken>>;
  let dataSource: jest.Mocked<DataSource>;

  const mockQueryRunner = {
    connect: jest.fn(),
    startTransaction: jest.fn(),
    commitTransaction: jest.fn(),
    rollbackTransaction: jest.fn(),
    release: jest.fn(),
    manager: {
      save: jest.fn(),
      update: jest.fn(),
    },
  };

  const EMPRESA_ID = 'empresa-uuid-1';

  const mockUsuario = (overrides: Partial<Usuario> = {}): Usuario =>
    ({
      id: 'user-uuid-1',
      empresa_id: EMPRESA_ID,
      nombre: 'Test User',
      email: 'test@empresa.com',
      password_hash: '$2b$12$hashvalue',
      rol: RolUsuario.FACTURADOR,
      activo: true,
      intentos_fallidos: 0,
      primer_intento_fallido: null,
      bloqueado_hasta: null,
      created_at: new Date(),
      updated_at: new Date(),
      ...overrides,
    }) as Usuario;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        {
          provide: getRepositoryToken(Usuario),
          useValue: {
            findOne: jest.fn(),
            findOneOrFail: jest.fn(),
            find: jest.fn(),
            create: jest.fn(),
            save: jest.fn(),
            count: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(RefreshToken),
          useValue: {
            update: jest.fn(),
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

    service = module.get<UsersService>(UsersService);
    usuarioRepo = module.get(getRepositoryToken(Usuario));
    refreshTokenRepo = module.get(getRepositoryToken(RefreshToken));
    dataSource = module.get(DataSource);

    jest.clearAllMocks();
    dataSource.createQueryRunner.mockReturnValue(mockQueryRunner as any);
  });

  describe('create', () => {
    const createDto: CreateUsuarioDto = {
      nombre: 'Nuevo Usuario',
      email: 'nuevo@empresa.com',
      password: 'Password1',
      rol: 'facturador',
    };

    it('should create a new user associated with the admin empresa', async () => {
      usuarioRepo.findOne.mockResolvedValue(null);
      usuarioRepo.create.mockImplementation((data: any) => ({ ...data, id: 'new-uuid' }));
      usuarioRepo.save.mockImplementation(async (entity: any) => ({
        ...entity,
        id: 'new-uuid',
        created_at: new Date(),
        updated_at: new Date(),
      }));

      const result = await service.create(createDto, EMPRESA_ID);

      expect(result.usuario_id).toBe('new-uuid');
      expect(result.nombre).toBe('Nuevo Usuario');
      expect(result.email).toBe('nuevo@empresa.com');
      expect(result.rol).toBe('facturador');
      expect(result.activo).toBe(true);
      // Should not include password_hash
      expect((result as any).password_hash).toBeUndefined();
    });

    it('should hash password with bcrypt cost 12', async () => {
      usuarioRepo.findOne.mockResolvedValue(null);
      usuarioRepo.create.mockImplementation((data: any) => ({ ...data, id: 'new-uuid' }));
      usuarioRepo.save.mockImplementation(async (entity: any) => ({
        ...entity,
        id: 'new-uuid',
      }));

      await service.create(createDto, EMPRESA_ID);

      const createCall = usuarioRepo.create.mock.calls[0][0] as any;
      const isValid = await bcrypt.compare(createDto.password, createCall.password_hash);
      expect(isValid).toBe(true);

      const rounds = bcrypt.getRounds(createCall.password_hash);
      expect(rounds).toBe(12);
    });

    it('should throw ConflictException if email already exists (Req 3.7)', async () => {
      usuarioRepo.findOne.mockResolvedValue(mockUsuario());

      await expect(service.create(createDto, EMPRESA_ID)).rejects.toThrow(ConflictException);
      await expect(service.create(createDto, EMPRESA_ID)).rejects.toThrow(
        'El correo electrónico ya está registrado',
      );
    });

    it('should associate user with the given empresa_id', async () => {
      usuarioRepo.findOne.mockResolvedValue(null);
      usuarioRepo.create.mockImplementation((data: any) => ({ ...data, id: 'new-uuid' }));
      usuarioRepo.save.mockImplementation(async (entity: any) => ({
        ...entity,
        id: 'new-uuid',
      }));

      await service.create(createDto, EMPRESA_ID);

      expect(usuarioRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          empresa_id: EMPRESA_ID,
        }),
      );
    });
  });

  describe('findAllByEmpresa', () => {
    it('should return all users of the empresa (Req 3.5)', async () => {
      const users = [
        mockUsuario({ id: 'u1', nombre: 'User 1', rol: RolUsuario.ADMIN }),
        mockUsuario({ id: 'u2', nombre: 'User 2', rol: RolUsuario.FACTURADOR }),
      ];
      usuarioRepo.find.mockResolvedValue(users);

      const result = await service.findAllByEmpresa(EMPRESA_ID);

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        usuario_id: 'u1',
        nombre: 'User 1',
        email: 'test@empresa.com',
        rol: RolUsuario.ADMIN,
        activo: true,
      });
      expect(usuarioRepo.find).toHaveBeenCalledWith({
        where: { empresa_id: EMPRESA_ID },
        order: { created_at: 'ASC' },
      });
    });

    it('should not include password_hash in response', async () => {
      usuarioRepo.find.mockResolvedValue([mockUsuario()]);

      const result = await service.findAllByEmpresa(EMPRESA_ID);

      expect((result[0] as any).password_hash).toBeUndefined();
    });
  });

  describe('update', () => {
    it('should throw NotFoundException if user does not exist', async () => {
      usuarioRepo.findOne.mockResolvedValue(null);

      const dto: UpdateUsuarioDto = { rol: 'lector' };

      await expect(service.update('nonexistent-id', dto, EMPRESA_ID)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw ForbiddenException for cross-tenant access (Req 3.4)', async () => {
      const otherEmpresaUser = mockUsuario({ empresa_id: 'other-empresa' });
      usuarioRepo.findOne.mockResolvedValue(otherEmpresaUser);

      const dto: UpdateUsuarioDto = { rol: 'lector' };

      await expect(
        service.update(otherEmpresaUser.id, dto, EMPRESA_ID, 'corr-123'),
      ).rejects.toThrow(ForbiddenException);
      await expect(
        service.update(otherEmpresaUser.id, dto, EMPRESA_ID, 'corr-123'),
      ).rejects.toThrow('No tiene permisos para gestionar usuarios de otra empresa');
    });

    it('should update user role successfully (Req 3.6)', async () => {
      const user = mockUsuario();
      usuarioRepo.findOne.mockResolvedValue(user);
      usuarioRepo.count.mockResolvedValue(2); // not last admin
      usuarioRepo.save.mockResolvedValue({ ...user, rol: RolUsuario.LECTOR });
      usuarioRepo.findOneOrFail.mockResolvedValue({
        ...user,
        rol: RolUsuario.LECTOR,
      });

      const dto: UpdateUsuarioDto = { rol: 'lector' };
      const result = await service.update(user.id, dto, EMPRESA_ID);

      expect(result.rol).toBe(RolUsuario.LECTOR);
    });

    it('should deactivate user and revoke refresh tokens (Req 3.3)', async () => {
      const user = mockUsuario({ rol: RolUsuario.FACTURADOR });
      usuarioRepo.findOne.mockResolvedValue(user);
      mockQueryRunner.manager.save.mockResolvedValue(undefined);
      mockQueryRunner.manager.update.mockResolvedValue(undefined);
      usuarioRepo.findOneOrFail.mockResolvedValue({
        ...user,
        activo: false,
      });

      const dto: UpdateUsuarioDto = { activo: false };
      const result = await service.update(user.id, dto, EMPRESA_ID);

      expect(result.activo).toBe(false);
      expect(mockQueryRunner.manager.update).toHaveBeenCalledWith(
        RefreshToken,
        { usuario_id: user.id, estado: EstadoToken.ACTIVO },
        { estado: EstadoToken.REVOCADO },
      );
      expect(mockQueryRunner.commitTransaction).toHaveBeenCalled();
    });

    it('should throw ConflictException when deactivating last admin (Req 3.8)', async () => {
      const admin = mockUsuario({ rol: RolUsuario.ADMIN });
      usuarioRepo.findOne.mockResolvedValue(admin);
      usuarioRepo.count.mockResolvedValue(1); // last admin

      const dto: UpdateUsuarioDto = { activo: false };

      await expect(service.update(admin.id, dto, EMPRESA_ID)).rejects.toThrow(ConflictException);
      await expect(service.update(admin.id, dto, EMPRESA_ID)).rejects.toThrow(
        'No se puede desactivar o cambiar el rol del último administrador activo de la empresa',
      );
    });

    it('should throw ConflictException when changing role of last admin (Req 3.8)', async () => {
      const admin = mockUsuario({ rol: RolUsuario.ADMIN });
      usuarioRepo.findOne.mockResolvedValue(admin);
      usuarioRepo.count.mockResolvedValue(1); // last admin

      const dto: UpdateUsuarioDto = { rol: 'facturador' };

      await expect(service.update(admin.id, dto, EMPRESA_ID)).rejects.toThrow(ConflictException);
    });

    it('should allow role change when more than one admin exists', async () => {
      const admin = mockUsuario({ rol: RolUsuario.ADMIN });
      usuarioRepo.findOne.mockResolvedValue(admin);
      usuarioRepo.count.mockResolvedValue(2); // not last admin
      usuarioRepo.save.mockResolvedValue({ ...admin, rol: RolUsuario.FACTURADOR });
      usuarioRepo.findOneOrFail.mockResolvedValue({
        ...admin,
        rol: RolUsuario.FACTURADOR,
      });

      const dto: UpdateUsuarioDto = { rol: 'facturador' };
      const result = await service.update(admin.id, dto, EMPRESA_ID);

      expect(result.rol).toBe(RolUsuario.FACTURADOR);
    });

    it('should rollback transaction on deactivation failure', async () => {
      const user = mockUsuario({ rol: RolUsuario.FACTURADOR });
      usuarioRepo.findOne.mockResolvedValue(user);
      mockQueryRunner.manager.save.mockRejectedValue(new Error('DB error'));

      const dto: UpdateUsuarioDto = { activo: false };

      await expect(service.update(user.id, dto, EMPRESA_ID)).rejects.toThrow();

      expect(mockQueryRunner.rollbackTransaction).toHaveBeenCalled();
      expect(mockQueryRunner.release).toHaveBeenCalled();
    });
  });
});
