import {
  Injectable,
  ConflictException,
  ForbiddenException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import * as bcrypt from 'bcrypt';

import { Usuario } from '../../database/entities/usuario.entity.js';
import { RefreshToken } from '../../database/entities/refresh-token.entity.js';
import { RolUsuario, EstadoToken } from '../../database/enums.js';
import type { CreateUsuarioDto, UpdateUsuarioDto } from './dto/users.schemas.js';

const BCRYPT_COST = 12;

export interface UsuarioResponse {
  usuario_id: string;
  nombre: string;
  email: string;
  rol: string;
  activo: boolean;
}

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    @InjectRepository(Usuario)
    private readonly usuarioRepo: Repository<Usuario>,
    @InjectRepository(RefreshToken)
    // Ensures TypeORM registers this repo (used via queryRunner.manager)
    // @ts-expect-error TS6138 - injected for DI registration, accessed via queryRunner.manager
    private readonly refreshTokenRepo: Repository<RefreshToken>,
    private readonly dataSource: DataSource,
  ) {}

  /**
   * Crear un nuevo usuario asociado a la empresa del administrador.
   * Req 3.1, 3.7
   */
  async create(dto: CreateUsuarioDto, empresaId: string): Promise<UsuarioResponse> {
    // Verificar unicidad de email (Req 3.7)
    const existente = await this.usuarioRepo.findOne({
      where: { email: dto.email },
    });
    if (existente) {
      throw new ConflictException('El correo electrónico ya está registrado');
    }

    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_COST);

    const usuario = this.usuarioRepo.create({
      empresa_id: empresaId,
      nombre: dto.nombre,
      email: dto.email,
      password_hash: passwordHash,
      rol: dto.rol as RolUsuario,
      activo: true,
    });

    const saved = await this.usuarioRepo.save(usuario);

    return this.toResponse(saved);
  }

  /**
   * Listar todos los usuarios de la misma empresa.
   * Req 3.5
   */
  async findAllByEmpresa(empresaId: string): Promise<UsuarioResponse[]> {
    const usuarios = await this.usuarioRepo.find({
      where: { empresa_id: empresaId },
      order: { created_at: 'ASC' },
    });

    return usuarios.map((u) => this.toResponse(u));
  }

  /**
   * Actualizar rol y/o estado activo de un usuario.
   * Req 3.3, 3.4, 3.6, 3.8
   */
  async update(
    usuarioId: string,
    dto: UpdateUsuarioDto,
    adminEmpresaId: string,
    correlationId?: string,
  ): Promise<UsuarioResponse> {
    const usuario = await this.usuarioRepo.findOne({
      where: { id: usuarioId },
    });

    if (!usuario) {
      throw new NotFoundException('Usuario no encontrado');
    }

    // Verificar que usuario pertenece a la misma empresa (Req 3.4)
    if (usuario.empresa_id !== adminEmpresaId) {
      this.logger.warn(
        `Intento de gestión cross-tenant: admin empresa ${adminEmpresaId} -> usuario empresa ${usuario.empresa_id} | ID_Correlacion: ${correlationId ?? 'N/A'}`,
      );
      throw new ForbiddenException('No tiene permisos para gestionar usuarios de otra empresa');
    }

    // Protección del último administrador (Req 3.8)
    await this.validateLastAdminProtection(usuario, dto);

    // Actualizar campos
    if (dto.rol !== undefined) {
      usuario.rol = dto.rol as RolUsuario;
    }

    if (dto.activo !== undefined) {
      usuario.activo = dto.activo;
    }

    // Si se desactiva el usuario, revocar refresh tokens (Req 3.3)
    if (dto.activo === false) {
      const queryRunner = this.dataSource.createQueryRunner();
      await queryRunner.connect();
      await queryRunner.startTransaction();

      try {
        await queryRunner.manager.save(Usuario, usuario);

        await queryRunner.manager.update(
          RefreshToken,
          { usuario_id: usuarioId, estado: EstadoToken.ACTIVO },
          { estado: EstadoToken.REVOCADO },
        );

        await queryRunner.commitTransaction();
      } catch (error) {
        await queryRunner.rollbackTransaction();
        throw error;
      } finally {
        await queryRunner.release();
      }
    } else {
      await this.usuarioRepo.save(usuario);
    }

    // Refetch to return updated state
    const updated = await this.usuarioRepo.findOneOrFail({
      where: { id: usuarioId },
    });

    return this.toResponse(updated);
  }

  /**
   * Valida que no se desactive ni se cambie el rol del último admin activo de la empresa.
   * Req 3.8
   */
  private async validateLastAdminProtection(
    usuario: Usuario,
    dto: UpdateUsuarioDto,
  ): Promise<void> {
    const isRemovingAdmin =
      (dto.activo === false && usuario.rol === RolUsuario.ADMIN) ||
      (dto.rol !== undefined && dto.rol !== RolUsuario.ADMIN && usuario.rol === RolUsuario.ADMIN);

    if (!isRemovingAdmin) {
      return;
    }

    const activeAdminCount = await this.usuarioRepo.count({
      where: {
        empresa_id: usuario.empresa_id,
        rol: RolUsuario.ADMIN,
        activo: true,
      },
    });

    if (activeAdminCount <= 1) {
      throw new ConflictException(
        'No se puede desactivar o cambiar el rol del último administrador activo de la empresa',
      );
    }
  }

  private toResponse(usuario: Usuario): UsuarioResponse {
    return {
      usuario_id: usuario.id,
      nombre: usuario.nombre,
      email: usuario.email,
      rol: usuario.rol,
      activo: usuario.activo,
    };
  }
}
