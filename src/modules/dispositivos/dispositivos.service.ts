import {
  Injectable,
  ForbiddenException,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Dispositivo } from '../../database/entities/dispositivo.entity.js';
import { Empresa } from '../../database/entities/empresa.entity.js';
import { ApiKey } from '../../database/entities/api-key.entity.js';

@Injectable()
export class DispositivosService {
  constructor(
    @InjectRepository(Dispositivo)
    private readonly dispositivoRepo: Repository<Dispositivo>,
    @InjectRepository(Empresa)
    private readonly empresaRepo: Repository<Empresa>,
    @InjectRepository(ApiKey)
    private readonly apiKeyRepo: Repository<ApiKey>,
  ) {}

  /**
   * Registra un dispositivo Print Bridge.
   * Valida que no se exceda el límite del plan.
   * Si el machine_id ya existe para la empresa, lo reactiva.
   */
  async registrar(
    empresaId: string,
    machineId: string,
    nombreEquipo: string,
  ): Promise<{ autorizado: boolean; dispositivo_id?: string; error?: string }> {
    const empresa = await this.empresaRepo.findOne({
      where: { id: empresaId },
      relations: ['plan'],
    });

    if (!empresa || !empresa.plan) {
      return { autorizado: false, error: 'Empresa sin plan asignado' };
    }

    const maxDispositivos = empresa.plan.max_dispositivos;
    if (maxDispositivos === 0) {
      return { autorizado: false, error: 'Su plan no incluye Print Bridge. Contacte soporte para upgrade.' };
    }

    // Check if this machine is already registered
    const existing = await this.dispositivoRepo.findOne({
      where: { empresa_id: empresaId, machine_id: machineId },
    });

    if (existing) {
      // Reactivate if inactive
      existing.activo = true;
      existing.nombre_equipo = nombreEquipo;
      existing.ultima_actividad = new Date();
      await this.dispositivoRepo.save(existing);
      return { autorizado: true, dispositivo_id: existing.id };
    }

    // Count active devices
    const activosCount = await this.dispositivoRepo.count({
      where: { empresa_id: empresaId, activo: true },
    });

    if (activosCount >= maxDispositivos) {
      return {
        autorizado: false,
        error: `Límite de equipos alcanzado (${activosCount}/${maxDispositivos}). Desactive un equipo o upgrade su plan.`,
      };
    }

    // Register new device
    const dispositivo = this.dispositivoRepo.create({
      empresa_id: empresaId,
      machine_id: machineId,
      nombre_equipo: nombreEquipo,
      activo: true,
      ultima_actividad: new Date(),
    });

    const saved = await this.dispositivoRepo.save(dispositivo);
    return { autorizado: true, dispositivo_id: saved.id };
  }

  /**
   * Lista dispositivos activos de una empresa.
   */
  async listar(empresaId: string) {
    return this.dispositivoRepo.find({
      where: { empresa_id: empresaId },
      order: { ultima_actividad: 'DESC' },
    });
  }

  /**
   * Desactiva un dispositivo (libera un slot).
   */
  async desactivar(id: string, empresaId: string) {
    const dispositivo = await this.dispositivoRepo.findOne({
      where: { id, empresa_id: empresaId },
    });
    if (!dispositivo) throw new NotFoundException('Dispositivo no encontrado');

    dispositivo.activo = false;
    await this.dispositivoRepo.save(dispositivo);
    return { message: 'Dispositivo desactivado', id };
  }

  /**
   * Actualiza última actividad (heartbeat del Print Bridge).
   */
  async heartbeat(dispositivoId: string, empresaId: string) {
    await this.dispositivoRepo.update(
      { id: dispositivoId, empresa_id: empresaId },
      { ultima_actividad: new Date() },
    );
  }

  /**
   * Valida que se puede crear una API Key más
   * (no excede el límite del plan).
   */
  async validarLimiteApiKeys(empresaId: string): Promise<void> {
    const empresa = await this.empresaRepo.findOne({
      where: { id: empresaId },
      relations: ['plan'],
    });

    if (!empresa || !empresa.plan) {
      throw new ForbiddenException('Empresa sin plan asignado');
    }

    if (!empresa.plan.permite_api) {
      throw new ForbiddenException(
        'Su plan no incluye acceso por API. Upgrade a un plan con API.',
      );
    }

    const apiKeysActivas = await this.apiKeyRepo.count({
      where: { empresa_id: empresaId, activo: true },
    });

    if (apiKeysActivas >= empresa.plan.max_api_keys) {
      throw new ConflictException(
        `Límite de API Keys alcanzado (${apiKeysActivas}/${empresa.plan.max_api_keys}). Revoque una key existente o upgrade su plan.`,
      );
    }
  }
}
