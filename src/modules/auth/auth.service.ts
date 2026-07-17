import {
  Injectable,
  Inject,
  UnauthorizedException,
  ForbiddenException,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import * as jwt from 'jsonwebtoken';
import { createHash, randomUUID } from 'crypto';

import { Usuario } from '../../database/entities/usuario.entity.js';
import { RefreshToken } from '../../database/entities/refresh-token.entity.js';
import { SuperAdmin } from '../../database/entities/super-admin.entity.js';
import { EstadoEmpresa, EstadoToken } from '../../database/enums.js';
import * as SecretsInterface from '../../infrastructure/secrets/secrets.interface.js';
import type { ISecretsProvider } from '../../infrastructure/secrets/secrets.interface.js';
import type { TokenPair } from './interfaces/token-pair.interface.js';
import type { RequestContext } from '../../common/interfaces/request-context.interface.js';

const ACCESS_TOKEN_TTL_SECONDS = 900; // 15 min
const REFRESH_TOKEN_TTL_DAYS = 7;
const LOCKOUT_WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const LOCKOUT_DURATION_MS = 15 * 60 * 1000; // 15 minutes
const MAX_FAILED_ATTEMPTS = 5;

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(Usuario)
    private readonly usuarioRepo: Repository<Usuario>,
    @InjectRepository(RefreshToken)
    private readonly refreshTokenRepo: Repository<RefreshToken>,
    @InjectRepository(SuperAdmin)
    private readonly superAdminRepo: Repository<SuperAdmin>,
    @Inject(SecretsInterface.SECRETS_PROVIDER)
    private readonly secretsProvider: ISecretsProvider,
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

    const passwordValid = await bcrypt.compare(password, superAdmin.password_hash);
    if (!passwordValid) {
      throw new UnauthorizedException('Credenciales inválidas');
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
}
