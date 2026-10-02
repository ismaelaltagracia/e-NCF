import {
  Injectable,
  Inject,
  UnauthorizedException,
  ForbiddenException,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull } from 'typeorm';
import * as bcrypt from 'bcrypt';
import * as jwt from 'jsonwebtoken';
import { createHash, randomUUID } from 'crypto';

import { ConfigService } from '@nestjs/config';
import { Usuario } from '../../database/entities/usuario.entity.js';
import { RefreshToken } from '../../database/entities/refresh-token.entity.js';
import { PasswordResetToken } from '../../database/entities/password-reset-token.entity.js';
import { SuperAdmin } from '../../database/entities/super-admin.entity.js';
import { Empresa } from '../../database/entities/empresa.entity.js';
import { EstadoEmpresa, EstadoToken } from '../../database/enums.js';
import * as SecretsInterface from '../../infrastructure/secrets/secrets.interface.js';
import type { ISecretsProvider } from '../../infrastructure/secrets/secrets.interface.js';
import { EMAIL_SERVICE } from '../../infrastructure/email/email.interface.js';
import type { IEmailService } from '../../infrastructure/email/email.interface.js';
import type { TokenPair } from './interfaces/token-pair.interface.js';
import type { RequestContext } from '../../common/interfaces/request-context.interface.js';

const ACCESS_TOKEN_TTL_SECONDS = 900; // 15 min
const REFRESH_TOKEN_TTL_DAYS = 7;
const LOCKOUT_WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const LOCKOUT_DURATION_MS = 15 * 60 * 1000; // 15 minutes
const MAX_FAILED_ATTEMPTS = 5;
const BCRYPT_COST = 12;

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(Usuario)
    private readonly usuarioRepo: Repository<Usuario>,
    @InjectRepository(Empresa)
    private readonly empresaRepo: Repository<Empresa>,
    @InjectRepository(RefreshToken)
    private readonly refreshTokenRepo: Repository<RefreshToken>,
    @InjectRepository(PasswordResetToken)
    private readonly passwordResetTokenRepo: Repository<PasswordResetToken>,
    @InjectRepository(SuperAdmin)
    private readonly superAdminRepo: Repository<SuperAdmin>,
    @Inject(SecretsInterface.SECRETS_PROVIDER)
    private readonly secretsProvider: ISecretsProvider,
    @Inject(EMAIL_SERVICE)
    private readonly emailService: IEmailService,
    private readonly configService: ConfigService,
  ) {}

  async login(email: string, password: string): Promise<TokenPair> {
    // Try SuperAdmin first
    const superAdmin = await this.superAdminRepo.findOne({
      where: { email },
    });

    if (superAdmin) {
      return this.loginSuperAdmin(superAdmin, password);
    }

    // Try regular user
    const usuario = await this.usuarioRepo.findOne({
      where: { email },
      relations: ['empresa'],
    });

    if (!usuario) {
      throw new UnauthorizedException('Credenciales inválidas');
    }

    if (!usuario.activo) {
      throw new UnauthorizedException('Credenciales inválidas');
    }

    // Check if user is locked
    if (usuario.bloqueado_hasta && usuario.bloqueado_hasta.getTime() > Date.now()) {
      throw new HttpException(
        'Demasiados intentos de login. Intente nuevamente más tarde.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    // If lockout has expired, reset the counter
    if (usuario.bloqueado_hasta && usuario.bloqueado_hasta.getTime() <= Date.now()) {
      usuario.intentos_fallidos = 0;
      usuario.bloqueado_hasta = null;
      usuario.primer_intento_fallido = null;
      await this.usuarioRepo.save(usuario);
    }

    // Verify password with bcrypt
    const passwordValid = await bcrypt.compare(password, usuario.password_hash);
    if (!passwordValid) {
      // Check if we're within the 15-minute window
      const now = Date.now();
      if (
        !usuario.primer_intento_fallido ||
        now - usuario.primer_intento_fallido.getTime() > LOCKOUT_WINDOW_MS
      ) {
        // Start a new window
        usuario.intentos_fallidos = 1;
        usuario.primer_intento_fallido = new Date(now);
      } else {
        // Within the window, increment
        usuario.intentos_fallidos += 1;
      }

      // If reached max attempts within window, lock the account
      if (usuario.intentos_fallidos >= MAX_FAILED_ATTEMPTS) {
        usuario.bloqueado_hasta = new Date(now + LOCKOUT_DURATION_MS);
      }

      await this.usuarioRepo.save(usuario);
      throw new UnauthorizedException('Credenciales inválidas');
    }

    // Reset failed attempts on successful login
    if (
      usuario.intentos_fallidos > 0 ||
      usuario.bloqueado_hasta ||
      usuario.primer_intento_fallido
    ) {
      usuario.intentos_fallidos = 0;
      usuario.bloqueado_hasta = null;
      usuario.primer_intento_fallido = null;
      await this.usuarioRepo.save(usuario);
    }

    // Verify empresa estado is not "inactivo"
    const empresa = usuario.empresa;
    if (!empresa || empresa.estado === EstadoEmpresa.INACTIVO) {
      throw new ForbiddenException('La empresa se encuentra inactiva');
    }

    // Generate tokens
    const accessToken = await this.generateAccessToken({
      usuario_id: usuario.id,
      empresa_id: empresa.id,
      rnc: empresa.rnc,
      rol: usuario.rol,
    });

    const refreshToken = await this.createRefreshToken(usuario.id, empresa.id);

    return {
      access_token: accessToken,
      refresh_token: refreshToken,
      expires_in: ACCESS_TOKEN_TTL_SECONDS,
      token_type: 'Bearer',
    };
  }

  async refresh(refreshToken: string): Promise<TokenPair> {
    const tokenHash = this.hashToken(refreshToken);

    const storedToken = await this.refreshTokenRepo.findOne({
      where: { token_hash: tokenHash, estado: EstadoToken.ACTIVO },
    });

    if (!storedToken) {
      throw new UnauthorizedException('Refresh token inválido');
    }

    // Check expiration
    if (storedToken.expira_en.getTime() < Date.now()) {
      storedToken.estado = EstadoToken.EXPIRADO;
      await this.refreshTokenRepo.save(storedToken);
      throw new UnauthorizedException('Refresh token expirado');
    }

    // Revoke old token
    storedToken.estado = EstadoToken.REVOCADO;
    await this.refreshTokenRepo.save(storedToken);

    // Determine if this is a super admin or regular user token
    if (!storedToken.usuario_id) {
      // SuperAdmin refresh - no empresa_id
      const accessToken = await this.generateAccessToken({
        usuario_id: storedToken.usuario_id!,
        empresa_id: '',
        rnc: '',
        rol: 'super_admin',
      });

      const newRefreshToken = await this.createRefreshToken(null, null);

      return {
        access_token: accessToken,
        refresh_token: newRefreshToken,
        expires_in: ACCESS_TOKEN_TTL_SECONDS,
        token_type: 'Bearer',
      };
    }

    // Regular user refresh - verify user and empresa still valid
    const usuario = await this.usuarioRepo.findOne({
      where: { id: storedToken.usuario_id },
      relations: ['empresa'],
    });

    if (!usuario || !usuario.activo) {
      throw new UnauthorizedException('Usuario inactivo');
    }

    if (!usuario.empresa || usuario.empresa.estado === EstadoEmpresa.INACTIVO) {
      throw new ForbiddenException('La empresa se encuentra inactiva');
    }

    const accessToken = await this.generateAccessToken({
      usuario_id: usuario.id,
      empresa_id: usuario.empresa.id,
      rnc: usuario.empresa.rnc,
      rol: usuario.rol,
    });

    const newRefreshToken = await this.createRefreshToken(usuario.id, usuario.empresa.id);

    return {
      access_token: accessToken,
      refresh_token: newRefreshToken,
      expires_in: ACCESS_TOKEN_TTL_SECONDS,
      token_type: 'Bearer',
    };
  }

  async logout(refreshToken: string): Promise<void> {
    const tokenHash = this.hashToken(refreshToken);

    const storedToken = await this.refreshTokenRepo.findOne({
      where: { token_hash: tokenHash, estado: EstadoToken.ACTIVO },
    });

    if (!storedToken) {
      // Silently succeed even if token not found (idempotent)
      return;
    }

    storedToken.estado = EstadoToken.REVOCADO;
    await this.refreshTokenRepo.save(storedToken);
  }

  async validateAccessToken(token: string): Promise<RequestContext> {
    const publicKey = await this.secretsProvider.getJwtPublicKey();

    try {
      const payload = jwt.verify(token, publicKey, {
        algorithms: ['RS256'],
      }) as jwt.JwtPayload;

      return {
        tipo: 'usuario',
        empresa_id: payload.empresa_id ?? '',
        rnc: payload.rnc ?? '',
        usuario_id: payload.usuario_id,
        rol: payload.rol,
      };
    } catch {
      throw new UnauthorizedException('Token de acceso inválido');
    }
  }

  private async loginSuperAdmin(superAdmin: SuperAdmin, password: string): Promise<TokenPair> {
    if (!superAdmin.activo) {
      throw new UnauthorizedException('Credenciales inválidas');
    }

    // Bloqueo por intentos fallidos (misma política que usuarios: 5 intentos / 15 min)
    if (superAdmin.bloqueado_hasta && superAdmin.bloqueado_hasta.getTime() > Date.now()) {
      throw new HttpException(
        'Demasiados intentos de login. Intente nuevamente más tarde.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    // Si el bloqueo expiró, reiniciar el contador
    if (superAdmin.bloqueado_hasta && superAdmin.bloqueado_hasta.getTime() <= Date.now()) {
      superAdmin.intentos_fallidos = 0;
      superAdmin.bloqueado_hasta = null;
      superAdmin.primer_intento_fallido = null;
      await this.superAdminRepo.save(superAdmin);
    }

    const passwordValid = await bcrypt.compare(password, superAdmin.password_hash);
    if (!passwordValid) {
      const now = Date.now();
      if (
        !superAdmin.primer_intento_fallido ||
        now - superAdmin.primer_intento_fallido.getTime() > LOCKOUT_WINDOW_MS
      ) {
        superAdmin.intentos_fallidos = 1;
        superAdmin.primer_intento_fallido = new Date(now);
      } else {
        superAdmin.intentos_fallidos += 1;
      }

      if (superAdmin.intentos_fallidos >= MAX_FAILED_ATTEMPTS) {
        superAdmin.bloqueado_hasta = new Date(now + LOCKOUT_DURATION_MS);
      }

      await this.superAdminRepo.save(superAdmin);
      throw new UnauthorizedException('Credenciales inválidas');
    }

    // Login exitoso: reiniciar contadores si los hubiera
    if (
      superAdmin.intentos_fallidos > 0 ||
      superAdmin.bloqueado_hasta ||
      superAdmin.primer_intento_fallido
    ) {
      superAdmin.intentos_fallidos = 0;
      superAdmin.bloqueado_hasta = null;
      superAdmin.primer_intento_fallido = null;
      await this.superAdminRepo.save(superAdmin);
    }

    const accessToken = await this.generateAccessToken({
      usuario_id: superAdmin.id,
      empresa_id: '',
      rnc: '',
      rol: 'super_admin',
    });

    const refreshToken = await this.createRefreshToken(null, null);

    return {
      access_token: accessToken,
      refresh_token: refreshToken,
      expires_in: ACCESS_TOKEN_TTL_SECONDS,
      token_type: 'Bearer',
    };
  }

  private async generateAccessToken(claims: {
    usuario_id: string | null;
    empresa_id: string;
    rnc: string;
    rol: string;
  }): Promise<string> {
    const privateKey = await this.secretsProvider.getJwtPrivateKey();

    return jwt.sign(
      {
        usuario_id: claims.usuario_id,
        empresa_id: claims.empresa_id,
        rnc: claims.rnc,
        rol: claims.rol,
      },
      privateKey,
      {
        algorithm: 'RS256',
        expiresIn: ACCESS_TOKEN_TTL_SECONDS,
      },
    );
  }

  /**
   * Genera un access token para cambio de contexto de contador.
   * Permite al contador operar como admin de la empresa seleccionada.
   */
  async generateAccessTokenForContador(claims: {
    usuario_id: string;
    empresa_id: string;
    rol: string;
  }): Promise<string> {
    const empresa = await this.empresaRepo.findOne({ where: { id: claims.empresa_id } });
    return this.generateAccessToken({
      usuario_id: claims.usuario_id,
      empresa_id: claims.empresa_id,
      rnc: empresa?.rnc ?? '',
      rol: claims.rol,
    });
  }

  private async createRefreshToken(
    usuarioId: string | null,
    empresaId: string | null,
  ): Promise<string> {
    const rawToken = randomUUID();
    const tokenHash = this.hashToken(rawToken);

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + REFRESH_TOKEN_TTL_DAYS);

    const refreshTokenEntity = this.refreshTokenRepo.create({
      usuario_id: usuarioId,
      empresa_id: empresaId,
      token_hash: tokenHash,
      estado: EstadoToken.ACTIVO,
      expira_en: expiresAt,
    });

    await this.refreshTokenRepo.save(refreshTokenEntity);

    return rawToken;
  }

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Gestión de contraseña (cambio por elección y recuperación por email)
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Cambia la contraseña del usuario autenticado (usuario de empresa o super
   * admin), verificando primero la contraseña actual. Al cambiarla, revoca todos
   * los refresh tokens activos del usuario para cerrar otras sesiones.
   */
  async changePassword(
    user: RequestContext,
    passwordActual: string,
    passwordNueva: string,
  ): Promise<void> {
    if (!user.usuario_id) {
      throw new UnauthorizedException('Sesión inválida');
    }

    if (user.rol === 'super_admin') {
      const superAdmin = await this.superAdminRepo.findOne({ where: { id: user.usuario_id } });
      if (!superAdmin || !superAdmin.activo) {
        throw new UnauthorizedException('Sesión inválida');
      }

      const valid = await bcrypt.compare(passwordActual, superAdmin.password_hash);
      if (!valid) {
        throw new UnauthorizedException('La contraseña actual es incorrecta');
      }

      superAdmin.password_hash = await bcrypt.hash(passwordNueva, BCRYPT_COST);
      await this.superAdminRepo.save(superAdmin);
      await this.revokeAllRefreshTokensForSuperAdmin();
      return;
    }

    const usuario = await this.usuarioRepo.findOne({ where: { id: user.usuario_id } });
    if (!usuario || !usuario.activo) {
      throw new UnauthorizedException('Sesión inválida');
    }

    const valid = await bcrypt.compare(passwordActual, usuario.password_hash);
    if (!valid) {
      throw new UnauthorizedException('La contraseña actual es incorrecta');
    }

    usuario.password_hash = await bcrypt.hash(passwordNueva, BCRYPT_COST);
    await this.usuarioRepo.save(usuario);
    await this.revokeAllRefreshTokensForUsuario(usuario.id);
  }

  /**
   * Inicia la recuperación de contraseña. Siempre resuelve sin error (y el
   * controller responde 200) aunque el email no exista, para no revelar qué
   * cuentas están registradas. Si existe, genera un token single-use, guarda su
   * hash y envía el enlace por email.
   */
  async forgotPassword(email: string): Promise<void> {
    const usuario = await this.usuarioRepo.findOne({ where: { email } });
    const superAdmin = usuario ? null : await this.superAdminRepo.findOne({ where: { email } });

    const cuenta = usuario ?? superAdmin;
    if (!cuenta || !cuenta.activo) {
      // No revelamos si la cuenta existe o está inactiva.
      return;
    }

    const ttlMinutes = this.configService.get<number>('PASSWORD_RESET_TTL_MINUTES', 60);
    const rawToken = randomUUID();
    const tokenHash = this.hashToken(rawToken);
    const expiraEn = new Date(Date.now() + ttlMinutes * 60 * 1000);

    const resetToken = this.passwordResetTokenRepo.create({
      usuario_id: usuario ? usuario.id : null,
      super_admin_id: superAdmin ? superAdmin.id : null,
      token_hash: tokenHash,
      expira_en: expiraEn,
      usado: false,
    });
    await this.passwordResetTokenRepo.save(resetToken);

    const frontendUrl = this.configService
      .get<string>('FRONTEND_URL', 'http://localhost:5173')
      .replace(/\/+$/, '');
    // La SPA se sirve bajo el basename "/app" (ver client main.tsx BrowserRouter).
    const resetLink = `${frontendUrl}/app/reset-password?token=${encodeURIComponent(rawToken)}`;

    await this.emailService.send({
      to: email,
      subject: 'Recuperación de contraseña — e-NCF',
      html: this.buildResetEmailHtml(cuenta.nombre, resetLink, ttlMinutes),
    });
  }

  /**
   * Completa la recuperación: valida el token (existe, no usado, no expirado),
   * establece la nueva contraseña, marca el token como usado, revoca refresh
   * tokens activos y limpia el bloqueo por intentos fallidos.
   */
  async resetPassword(rawToken: string, passwordNueva: string): Promise<void> {
    const tokenHash = this.hashToken(rawToken);
    const resetToken = await this.passwordResetTokenRepo.findOne({
      where: { token_hash: tokenHash },
    });

    if (!resetToken || resetToken.usado || resetToken.expira_en.getTime() < Date.now()) {
      throw new UnauthorizedException('El enlace de recuperación es inválido o ha expirado');
    }

    const newHash = await bcrypt.hash(passwordNueva, BCRYPT_COST);

    if (resetToken.super_admin_id) {
      const superAdmin = await this.superAdminRepo.findOne({
        where: { id: resetToken.super_admin_id },
      });
      if (!superAdmin) {
        throw new UnauthorizedException('El enlace de recuperación es inválido o ha expirado');
      }
      superAdmin.password_hash = newHash;
      superAdmin.intentos_fallidos = 0;
      superAdmin.bloqueado_hasta = null;
      superAdmin.primer_intento_fallido = null;
      await this.superAdminRepo.save(superAdmin);
      await this.revokeAllRefreshTokensForSuperAdmin();
    } else if (resetToken.usuario_id) {
      const usuario = await this.usuarioRepo.findOne({ where: { id: resetToken.usuario_id } });
      if (!usuario) {
        throw new UnauthorizedException('El enlace de recuperación es inválido o ha expirado');
      }
      usuario.password_hash = newHash;
      usuario.intentos_fallidos = 0;
      usuario.bloqueado_hasta = null;
      usuario.primer_intento_fallido = null;
      await this.usuarioRepo.save(usuario);
      await this.revokeAllRefreshTokensForUsuario(usuario.id);
    } else {
      throw new UnauthorizedException('El enlace de recuperación es inválido o ha expirado');
    }

    resetToken.usado = true;
    await this.passwordResetTokenRepo.save(resetToken);

    // Invalida cualquier otro token de reset pendiente de la misma cuenta.
    await this.passwordResetTokenRepo.update(
      resetToken.usuario_id
        ? { usuario_id: resetToken.usuario_id, usado: false }
        : { super_admin_id: resetToken.super_admin_id!, usado: false },
      { usado: true },
    );
  }

  private async revokeAllRefreshTokensForUsuario(usuarioId: string): Promise<void> {
    await this.refreshTokenRepo.update(
      { usuario_id: usuarioId, estado: EstadoToken.ACTIVO },
      { estado: EstadoToken.REVOCADO },
    );
  }

  /**
   * Los refresh tokens de super admin tienen usuario_id y empresa_id en null.
   * Revocamos todos los activos sin usuario asociado.
   */
  private async revokeAllRefreshTokensForSuperAdmin(): Promise<void> {
    await this.refreshTokenRepo.update(
      { usuario_id: IsNull(), estado: EstadoToken.ACTIVO },
      { estado: EstadoToken.REVOCADO },
    );
  }

  private buildResetEmailHtml(nombre: string, resetLink: string, ttlMinutes: number): string {
    return `
      <div style="font-family: Arial, Helvetica, sans-serif; color: #1a3a5c; max-width: 520px; margin: 0 auto;">
        <h2 style="color: #1a3a5c;">Recuperación de contraseña</h2>
        <p>Hola ${nombre},</p>
        <p>Recibimos una solicitud para restablecer la contraseña de tu cuenta en e-NCF.
        Si fuiste tú, haz clic en el siguiente botón para elegir una nueva contraseña:</p>
        <p style="text-align: center; margin: 28px 0;">
          <a href="${resetLink}"
             style="background: #1a3a5c; color: #ffffff; text-decoration: none; padding: 12px 24px; border-radius: 8px; display: inline-block; font-weight: 600;">
            Restablecer contraseña
          </a>
        </p>
        <p>O copia y pega este enlace en tu navegador:</p>
        <p style="word-break: break-all; color: #4a6b8a;">${resetLink}</p>
        <p style="color: #6b7c8f; font-size: 13px;">
          Este enlace vence en ${ttlMinutes} minutos y solo puede usarse una vez.
          Si no solicitaste este cambio, puedes ignorar este correo; tu contraseña no cambiará.
        </p>
      </div>
    `;
  }
}
