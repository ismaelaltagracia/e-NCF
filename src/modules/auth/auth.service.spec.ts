import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import {
  UnauthorizedException,
  ForbiddenException,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import * as jwt from 'jsonwebtoken';
import { createHash, generateKeyPairSync } from 'crypto';
import { Repository } from 'typeorm';

import { AuthService } from './auth.service.js';
import { Usuario } from '../../database/entities/usuario.entity.js';
import { Empresa } from '../../database/entities/empresa.entity.js';
import { RefreshToken } from '../../database/entities/refresh-token.entity.js';
import { PasswordResetToken } from '../../database/entities/password-reset-token.entity.js';
import { SuperAdmin } from '../../database/entities/super-admin.entity.js';
import { EstadoEmpresa, EstadoToken, RolUsuario } from '../../database/enums.js';
import { SECRETS_PROVIDER } from '../../infrastructure/secrets/secrets.interface.js';
import { EMAIL_SERVICE } from '../../infrastructure/email/email.interface.js';
import { ConfigService } from '@nestjs/config';

// Generate RSA keys for testing
const { privateKey, publicKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
});

const mockSecretsProvider = {
  getJwtPrivateKey: jest.fn().mockResolvedValue(privateKey),
  getJwtPublicKey: jest.fn().mockResolvedValue(publicKey),
  getEncryptionKey: jest.fn().mockResolvedValue(Buffer.alloc(32)),
};

describe('AuthService', () => {
  let service: AuthService;
  let usuarioRepo: jest.Mocked<Partial<Repository<Usuario>>>;
  let refreshTokenRepo: jest.Mocked<Partial<Repository<RefreshToken>>>;
  let passwordResetTokenRepo: jest.Mocked<Partial<Repository<PasswordResetToken>>>;
  let superAdminRepo: jest.Mocked<Partial<Repository<SuperAdmin>>>;
  let emailService: { send: jest.Mock; isConfigured: jest.Mock };

  const mockEmpresa: Partial<Empresa> = {
    id: 'empresa-uuid-1',
    rnc: '101234567',
    nombre: 'Test Empresa',
    estado: EstadoEmpresa.ACTIVO,
  };

  const passwordHash = bcrypt.hashSync('SecurePass123!', 12);

  const mockUsuario: Partial<Usuario> = {
    id: 'user-uuid-1',
    email: 'user@test.com',
    password_hash: passwordHash,
    empresa_id: 'empresa-uuid-1',
    empresa: mockEmpresa as Empresa,
    rol: RolUsuario.ADMIN,
    activo: true,
    intentos_fallidos: 0,
    primer_intento_fallido: null,
    bloqueado_hasta: null,
  };

  const mockSuperAdmin: Partial<SuperAdmin> = {
    id: 'super-admin-uuid-1',
    email: 'admin@system.com',
    password_hash: passwordHash,
    nombre: 'Super Admin',
    activo: true,
    intentos_fallidos: 0,
    primer_intento_fallido: null,
    bloqueado_hasta: null,
  };

  beforeEach(async () => {
    usuarioRepo = {
      findOne: jest.fn(),
      save: jest.fn(),
    };

    refreshTokenRepo = {
      findOne: jest.fn(),
      create: jest.fn().mockImplementation((entity) => entity as RefreshToken),
      save: jest.fn().mockImplementation((entity) => Promise.resolve(entity)),
      update: jest.fn().mockResolvedValue({ affected: 0 }),
    };

    passwordResetTokenRepo = {
      findOne: jest.fn(),
      create: jest.fn().mockImplementation((entity) => entity as PasswordResetToken),
      save: jest.fn().mockImplementation((entity) => Promise.resolve(entity)),
      update: jest.fn().mockResolvedValue({ affected: 0 }),
    };

    superAdminRepo = {
      findOne: jest.fn(),
      save: jest.fn().mockImplementation((entity) => Promise.resolve(entity)),
    };

    emailService = {
      send: jest.fn().mockResolvedValue({ success: true, messageId: 'test' }),
      isConfigured: jest.fn().mockReturnValue(false),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        {
          provide: getRepositoryToken(Usuario),
          useValue: usuarioRepo,
        },
        {
          provide: getRepositoryToken(Empresa),
          useValue: {},
        },
        {
          provide: getRepositoryToken(RefreshToken),
          useValue: refreshTokenRepo,
        },
        {
          provide: getRepositoryToken(PasswordResetToken),
          useValue: passwordResetTokenRepo,
        },
        {
          provide: getRepositoryToken(SuperAdmin),
          useValue: superAdminRepo,
        },
        {
          provide: SECRETS_PROVIDER,
          useValue: mockSecretsProvider,
        },
        {
          provide: EMAIL_SERVICE,
          useValue: emailService,
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string, def?: unknown) => {
              if (key === 'PASSWORD_RESET_TTL_MINUTES') return 60;
              if (key === 'FRONTEND_URL') return 'http://localhost:5173';
              return def;
            }),
          },
        },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  describe('login', () => {
    it('should return a token pair for valid credentials', async () => {
      superAdminRepo.findOne!.mockResolvedValue(null);
      usuarioRepo.findOne!.mockResolvedValue(mockUsuario);

      const result = await service.login('user@test.com', 'SecurePass123!');

      expect(result.token_type).toBe('Bearer');
      expect(result.expires_in).toBe(900);
      expect(result.access_token).toBeDefined();
      expect(result.refresh_token).toBeDefined();

      // Verify JWT claims
      const decoded = jwt.verify(result.access_token, publicKey, {
        algorithms: ['RS256'],
      }) as jwt.JwtPayload;
      expect(decoded.usuario_id).toBe('user-uuid-1');
      expect(decoded.empresa_id).toBe('empresa-uuid-1');
      expect(decoded.rnc).toBe('101234567');
      expect(decoded.rol).toBe('admin');
    });

    it('should throw UnauthorizedException for non-existent user', async () => {
      superAdminRepo.findOne!.mockResolvedValue(null);
      usuarioRepo.findOne!.mockResolvedValue(null);

      await expect(service.login('noexist@test.com', 'pass')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should throw UnauthorizedException for wrong password', async () => {
      superAdminRepo.findOne!.mockResolvedValue(null);
      usuarioRepo.findOne!.mockResolvedValue(mockUsuario);
      usuarioRepo.save!.mockResolvedValue(mockUsuario);

      await expect(service.login('user@test.com', 'WrongPassword')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should throw ForbiddenException when empresa is not activo', async () => {
      const inactiveEmpresa: Partial<Empresa> = {
        ...mockEmpresa,
        estado: EstadoEmpresa.INACTIVO,
      };
      const userWithInactiveEmpresa: Partial<Usuario> = {
        ...mockUsuario,
        empresa: inactiveEmpresa as Empresa,
      };

      superAdminRepo.findOne!.mockResolvedValue(null);
      usuarioRepo.findOne!.mockResolvedValue(userWithInactiveEmpresa);

      await expect(service.login('user@test.com', 'SecurePass123!')).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('should throw UnauthorizedException for inactive user', async () => {
      const inactiveUser: Partial<Usuario> = {
        ...mockUsuario,
        activo: false,
      };

      superAdminRepo.findOne!.mockResolvedValue(null);
      usuarioRepo.findOne!.mockResolvedValue(inactiveUser);

      await expect(service.login('user@test.com', 'SecurePass123!')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should throw 429 HttpException for locked user', async () => {
      const lockedUser: Partial<Usuario> = {
        ...mockUsuario,
        bloqueado_hasta: new Date(Date.now() + 15 * 60 * 1000),
      };

      superAdminRepo.findOne!.mockResolvedValue(null);
      usuarioRepo.findOne!.mockResolvedValue(lockedUser);

      await expect(service.login('user@test.com', 'SecurePass123!')).rejects.toThrow(HttpException);

      try {
        await service.login('user@test.com', 'SecurePass123!');
      } catch (error) {
        expect((error as HttpException).getStatus()).toBe(HttpStatus.TOO_MANY_REQUESTS);
      }
    });

    it('should login SuperAdmin successfully', async () => {
      superAdminRepo.findOne!.mockResolvedValue(mockSuperAdmin);

      const result = await service.login('admin@system.com', 'SecurePass123!');

      expect(result.token_type).toBe('Bearer');
      expect(result.access_token).toBeDefined();

      const decoded = jwt.verify(result.access_token, publicKey, {
        algorithms: ['RS256'],
      }) as jwt.JwtPayload;
      expect(decoded.rol).toBe('super_admin');
      expect(decoded.empresa_id).toBe('');
    });

    it('should lock the SuperAdmin after MAX failed attempts', async () => {
      const superAdminAt4: Partial<SuperAdmin> = {
        ...mockSuperAdmin,
        intentos_fallidos: 4,
        primer_intento_fallido: new Date(),
        bloqueado_hasta: null,
      };
      superAdminRepo.findOne!.mockResolvedValue(superAdminAt4);
      superAdminRepo.save!.mockResolvedValue(superAdminAt4 as SuperAdmin);

      await expect(service.login('admin@system.com', 'WrongPass!')).rejects.toThrow(
        UnauthorizedException,
      );

      // El 5.º intento fallido debe fijar bloqueado_hasta
      const saved = superAdminRepo.save!.mock.calls.at(-1)?.[0] as SuperAdmin;
      expect(saved.intentos_fallidos).toBe(5);
      expect(saved.bloqueado_hasta).toBeInstanceOf(Date);
    });

    it('should reject login with 429 when SuperAdmin is locked', async () => {
      const lockedSuperAdmin: Partial<SuperAdmin> = {
        ...mockSuperAdmin,
        intentos_fallidos: 5,
        bloqueado_hasta: new Date(Date.now() + 10 * 60 * 1000),
      };
      superAdminRepo.findOne!.mockResolvedValue(lockedSuperAdmin);

      await expect(service.login('admin@system.com', 'SecurePass123!')).rejects.toThrow(
        HttpException,
      );
    });

    it('should increment failed attempts on wrong password', async () => {
      const userForAttempts: Partial<Usuario> = {
        ...mockUsuario,
        intentos_fallidos: 0,
        primer_intento_fallido: null,
      };

      superAdminRepo.findOne!.mockResolvedValue(null);
      usuarioRepo.findOne!.mockResolvedValue(userForAttempts);
      usuarioRepo.save!.mockResolvedValue(userForAttempts);

      await expect(service.login('user@test.com', 'WrongPassword')).rejects.toThrow(
        UnauthorizedException,
      );

      expect(usuarioRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          intentos_fallidos: 1,
          primer_intento_fallido: expect.any(Date),
        }),
      );
    });

    it('should lock user after 5 failed attempts within 15-minute window', async () => {
      const userWith4Attempts: Partial<Usuario> = {
        ...mockUsuario,
        intentos_fallidos: 4,
        primer_intento_fallido: new Date(Date.now() - 5 * 60 * 1000), // 5 mins ago (within window)
      };

      superAdminRepo.findOne!.mockResolvedValue(null);
      usuarioRepo.findOne!.mockResolvedValue(userWith4Attempts);
      usuarioRepo.save!.mockResolvedValue(userWith4Attempts);

      await expect(service.login('user@test.com', 'WrongPassword')).rejects.toThrow(
        UnauthorizedException,
      );

      expect(usuarioRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          intentos_fallidos: 5,
          bloqueado_hasta: expect.any(Date),
        }),
      );

      // Verify lockout duration is 15 minutes
      const savedUser = (usuarioRepo.save as jest.Mock).mock.calls[0][0];
      const lockoutEnd = savedUser.bloqueado_hasta.getTime();
      const expectedEnd = Date.now() + 15 * 60 * 1000;
      expect(lockoutEnd).toBeGreaterThan(expectedEnd - 2000);
      expect(lockoutEnd).toBeLessThan(expectedEnd + 2000);
    });

    it('should reset failed attempts counter if window has expired', async () => {
      const userWithExpiredWindow: Partial<Usuario> = {
        ...mockUsuario,
        intentos_fallidos: 4,
        primer_intento_fallido: new Date(Date.now() - 16 * 60 * 1000), // 16 mins ago (outside window)
      };

      superAdminRepo.findOne!.mockResolvedValue(null);
      usuarioRepo.findOne!.mockResolvedValue(userWithExpiredWindow);
      usuarioRepo.save!.mockResolvedValue(userWithExpiredWindow);

      await expect(service.login('user@test.com', 'WrongPassword')).rejects.toThrow(
        UnauthorizedException,
      );

      // Should start a new window with count = 1 (NOT increment to 5)
      expect(usuarioRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          intentos_fallidos: 1,
          primer_intento_fallido: expect.any(Date),
        }),
      );

      // Verify no lockout was applied
      const savedUser = (usuarioRepo.save as jest.Mock).mock.calls[0][0];
      expect(savedUser.bloqueado_hasta).not.toEqual(expect.any(Date));
    });

    it('should allow login after lockout expires and reset counter', async () => {
      const userWithExpiredLockout: Partial<Usuario> = {
        ...mockUsuario,
        intentos_fallidos: 5,
        primer_intento_fallido: new Date(Date.now() - 20 * 60 * 1000),
        bloqueado_hasta: new Date(Date.now() - 1 * 60 * 1000), // expired 1 min ago
      };

      superAdminRepo.findOne!.mockResolvedValue(null);
      usuarioRepo.findOne!.mockResolvedValue(userWithExpiredLockout);
      usuarioRepo.save!.mockResolvedValue(userWithExpiredLockout);

      const result = await service.login('user@test.com', 'SecurePass123!');

      expect(result.token_type).toBe('Bearer');
      expect(result.access_token).toBeDefined();
    });

    it('should reset counter on successful login after failed attempts', async () => {
      const userWithAttempts: Partial<Usuario> = {
        ...mockUsuario,
        intentos_fallidos: 3,
        primer_intento_fallido: new Date(Date.now() - 5 * 60 * 1000),
      };

      superAdminRepo.findOne!.mockResolvedValue(null);
      usuarioRepo.findOne!.mockResolvedValue(userWithAttempts);
      usuarioRepo.save!.mockResolvedValue(userWithAttempts);

      const result = await service.login('user@test.com', 'SecurePass123!');

      expect(result.token_type).toBe('Bearer');
      expect(usuarioRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          intentos_fallidos: 0,
          bloqueado_hasta: null,
          primer_intento_fallido: null,
        }),
      );
    });
  });

  describe('refresh', () => {
    it('should return a new token pair for valid refresh token', async () => {
      const rawToken = '550e8400-e29b-41d4-a716-446655440000';
      const tokenHash = createHash('sha256').update(rawToken).digest('hex');

      const storedToken: Partial<RefreshToken> = {
        id: 'rt-uuid-1',
        token_hash: tokenHash,
        estado: EstadoToken.ACTIVO,
        usuario_id: 'user-uuid-1',
        empresa_id: 'empresa-uuid-1',
        expira_en: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      };

      refreshTokenRepo.findOne!.mockResolvedValue(storedToken);
      usuarioRepo.findOne!.mockResolvedValue(mockUsuario);

      const result = await service.refresh(rawToken);

      expect(result.token_type).toBe('Bearer');
      expect(result.access_token).toBeDefined();
      expect(result.refresh_token).toBeDefined();
      expect(result.refresh_token).not.toBe(rawToken);

      // Verify old token was revoked
      expect(refreshTokenRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ estado: EstadoToken.REVOCADO }),
      );
    });

    it('should throw UnauthorizedException for invalid refresh token', async () => {
      refreshTokenRepo.findOne!.mockResolvedValue(null);

      await expect(service.refresh('invalid-uuid-token-here')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should throw UnauthorizedException for expired refresh token', async () => {
      const rawToken = '550e8400-e29b-41d4-a716-446655440000';
      const tokenHash = createHash('sha256').update(rawToken).digest('hex');

      const expiredToken: Partial<RefreshToken> = {
        id: 'rt-uuid-1',
        token_hash: tokenHash,
        estado: EstadoToken.ACTIVO,
        usuario_id: 'user-uuid-1',
        empresa_id: 'empresa-uuid-1',
        expira_en: new Date(Date.now() - 1000), // expired
      };

      refreshTokenRepo.findOne!.mockResolvedValue(expiredToken);

      await expect(service.refresh(rawToken)).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('logout', () => {
    it('should revoke refresh token on logout', async () => {
      const rawToken = '550e8400-e29b-41d4-a716-446655440000';
      const tokenHash = createHash('sha256').update(rawToken).digest('hex');

      const storedToken: Partial<RefreshToken> = {
        id: 'rt-uuid-1',
        token_hash: tokenHash,
        estado: EstadoToken.ACTIVO,
        usuario_id: 'user-uuid-1',
        empresa_id: 'empresa-uuid-1',
        expira_en: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      };

      refreshTokenRepo.findOne!.mockResolvedValue(storedToken);

      await service.logout(rawToken);

      expect(refreshTokenRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ estado: EstadoToken.REVOCADO }),
      );
    });

    it('should succeed silently for non-existent token', async () => {
      refreshTokenRepo.findOne!.mockResolvedValue(null);

      await expect(service.logout('nonexistent-token')).resolves.toBeUndefined();
    });
  });

  describe('validateAccessToken', () => {
    it('should return RequestContext for valid token', async () => {
      const token = jwt.sign(
        {
          usuario_id: 'user-uuid-1',
          empresa_id: 'empresa-uuid-1',
          rnc: '101234567',
          rol: 'admin',
        },
        privateKey,
        { algorithm: 'RS256', expiresIn: 900 },
      );

      const result = await service.validateAccessToken(token);

      expect(result.tipo).toBe('usuario');
      expect(result.usuario_id).toBe('user-uuid-1');
      expect(result.empresa_id).toBe('empresa-uuid-1');
      expect(result.rnc).toBe('101234567');
      expect(result.rol).toBe('admin');
    });

    it('should throw UnauthorizedException for invalid token', async () => {
      await expect(service.validateAccessToken('invalid-token')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should throw UnauthorizedException for expired token', async () => {
      const token = jwt.sign(
        {
          usuario_id: 'user-uuid-1',
          empresa_id: 'empresa-uuid-1',
          rnc: '101234567',
          rol: 'admin',
        },
        privateKey,
        { algorithm: 'RS256', expiresIn: -10 },
      );

      await expect(service.validateAccessToken(token)).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('changePassword', () => {
    const userCtx = {
      tipo: 'usuario' as const,
      empresa_id: 'empresa-uuid-1',
      rnc: '101234567',
      usuario_id: 'user-uuid-1',
      rol: 'admin' as const,
    };

    it('cambia la contraseña del usuario cuando la actual es correcta', async () => {
      usuarioRepo.findOne!.mockResolvedValue({ ...mockUsuario });

      await service.changePassword(userCtx, 'SecurePass123!', 'NuevaPass123!');

      expect(usuarioRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ password_hash: expect.any(String) }),
      );
      // Revoca refresh tokens activos del usuario
      expect(refreshTokenRepo.update).toHaveBeenCalledWith(
        expect.objectContaining({ usuario_id: 'user-uuid-1', estado: EstadoToken.ACTIVO }),
        { estado: EstadoToken.REVOCADO },
      );
    });

    it('rechaza si la contraseña actual es incorrecta', async () => {
      usuarioRepo.findOne!.mockResolvedValue({ ...mockUsuario });

      await expect(
        service.changePassword(userCtx, 'ContraseñaErrónea', 'NuevaPass123!'),
      ).rejects.toThrow(UnauthorizedException);
      expect(usuarioRepo.save).not.toHaveBeenCalled();
    });

    it('cambia la contraseña de un super admin', async () => {
      const superCtx = {
        tipo: 'usuario' as const,
        empresa_id: '',
        rnc: '',
        usuario_id: 'super-admin-uuid-1',
        rol: 'super_admin' as const,
      };
      superAdminRepo.findOne!.mockResolvedValue({ ...mockSuperAdmin });

      await service.changePassword(superCtx, 'SecurePass123!', 'NuevaPass123!');

      expect(superAdminRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ password_hash: expect.any(String) }),
      );
    });
  });

  describe('forgotPassword', () => {
    it('genera token y envía email cuando el usuario existe', async () => {
      usuarioRepo.findOne!.mockResolvedValue({ ...mockUsuario });

      await service.forgotPassword('user@test.com');

      expect(passwordResetTokenRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ usuario_id: 'user-uuid-1', usado: false }),
      );
      expect(emailService.send).toHaveBeenCalledWith(
        expect.objectContaining({ to: 'user@test.com' }),
      );
    });

    it('no revela si el email no existe (no envía email, no lanza)', async () => {
      usuarioRepo.findOne!.mockResolvedValue(null);
      superAdminRepo.findOne!.mockResolvedValue(null);

      await expect(service.forgotPassword('noexiste@test.com')).resolves.toBeUndefined();
      expect(passwordResetTokenRepo.save).not.toHaveBeenCalled();
      expect(emailService.send).not.toHaveBeenCalled();
    });
  });

  describe('resetPassword', () => {
    it('restablece la contraseña con un token válido y lo marca usado', async () => {
      const rawToken = 'reset-token-123';
      const tokenHash = createHash('sha256').update(rawToken).digest('hex');
      const resetToken: Partial<PasswordResetToken> = {
        id: 'prt-1',
        usuario_id: 'user-uuid-1',
        super_admin_id: null,
        token_hash: tokenHash,
        usado: false,
        expira_en: new Date(Date.now() + 60 * 60 * 1000),
      };
      passwordResetTokenRepo.findOne!.mockResolvedValue(resetToken as PasswordResetToken);
      usuarioRepo.findOne!.mockResolvedValue({ ...mockUsuario });

      await service.resetPassword(rawToken, 'NuevaPass123!');

      expect(usuarioRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ password_hash: expect.any(String), intentos_fallidos: 0 }),
      );
      expect(passwordResetTokenRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ usado: true }),
      );
    });

    it('rechaza un token expirado', async () => {
      const rawToken = 'reset-token-exp';
      const tokenHash = createHash('sha256').update(rawToken).digest('hex');
      passwordResetTokenRepo.findOne!.mockResolvedValue({
        id: 'prt-2',
        usuario_id: 'user-uuid-1',
        super_admin_id: null,
        token_hash: tokenHash,
        usado: false,
        expira_en: new Date(Date.now() - 1000),
      } as PasswordResetToken);

      await expect(service.resetPassword(rawToken, 'NuevaPass123!')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('rechaza un token ya usado', async () => {
      const rawToken = 'reset-token-used';
      const tokenHash = createHash('sha256').update(rawToken).digest('hex');
      passwordResetTokenRepo.findOne!.mockResolvedValue({
        id: 'prt-3',
        usuario_id: 'user-uuid-1',
        super_admin_id: null,
        token_hash: tokenHash,
        usado: true,
        expira_en: new Date(Date.now() + 60 * 60 * 1000),
      } as PasswordResetToken);

      await expect(service.resetPassword(rawToken, 'NuevaPass123!')).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });
});
