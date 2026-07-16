import { Injectable, ConflictException, InternalServerErrorException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import * as bcrypt from 'bcrypt';

import { Empresa } from '../../database/entities/empresa.entity.js';
import { Usuario } from '../../database/entities/usuario.entity.js';
import { Plan } from '../../database/entities/plan.entity.js';
import { EstadoEmpresa, RolUsuario } from '../../database/enums.js';
import type { RegistroDto } from './dto/onboarding.schemas.js';

const BCRYPT_COST = 12;
const PLAN_BASICO_NOMBRE = 'Básico';

export interface RegistroResult {
  empresa_id: string;
  usuario_id: string;
}

@Injectable()
export class OnboardingService {
  constructor(
    @InjectRepository(Empresa)
    private readonly empresaRepo: Repository<Empresa>,
    @InjectRepository(Usuario)
    private readonly usuarioRepo: Repository<Usuario>,
    @InjectRepository(Plan)
    private readonly planRepo: Repository<Plan>,
    private readonly dataSource: DataSource,
  ) {}

  async registrar(dto: RegistroDto): Promise<RegistroResult> {
    // Verificar unicidad de RNC (Req 1.3)
    const empresaExistente = await this.empresaRepo.findOne({
      where: { rnc: dto.rnc },
    });
    if (empresaExistente) {
      throw new ConflictException('El RNC ya se encuentra registrado');
    }

    // Verificar unicidad de email (Req 1.4)
    const usuarioExistente = await this.usuarioRepo.findOne({
      where: { email: dto.email },
    });
    if (usuarioExistente) {
      throw new ConflictException('El email ya se encuentra registrado');
    }

    // Buscar plan "Básico" por defecto (Req 27.2)
    const planBasico = await this.planRepo.findOne({
      where: { nombre: PLAN_BASICO_NOMBRE },
    });

    // Hash de contraseña con bcrypt costo 12 (Req 1.12)
    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_COST);

    // Crear Empresa + Usuario en una transacción (Req 1.2)
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const empresa = queryRunner.manager.create(Empresa, {
        rnc: dto.rnc,
        nombre: dto.empresa_nombre,
        estado: EstadoEmpresa.CERTIFICACION,
        plan_id: planBasico?.id ?? null,
      });
      const savedEmpresa = await queryRunner.manager.save(empresa);

      const usuario = queryRunner.manager.create(Usuario, {
        empresa_id: savedEmpresa.id,
        nombre: dto.admin_nombre,
        email: dto.email,
        password_hash: passwordHash,
        rol: RolUsuario.ADMIN,
        activo: true,
      });
      const savedUsuario = await queryRunner.manager.save(usuario);

      await queryRunner.commitTransaction();

      return {
        empresa_id: savedEmpresa.id,
        usuario_id: savedUsuario.id,
      };
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw new InternalServerErrorException('Error al registrar la empresa');
    } finally {
      await queryRunner.release();
    }
  }
}
