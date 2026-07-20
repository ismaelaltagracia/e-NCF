import {
  Injectable,
  OnModuleInit,
  HttpException,
  HttpStatus,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { Plan } from '../../database/entities/plan.entity.js';
import { UsoMensual } from '../../database/entities/uso-mensual.entity.js';
import { Empresa } from '../../database/entities/empresa.entity.js';

export interface UsoActualResponse {
  plan_nombre: string;
  limite_mensual: number | null;
  facturas_generadas: number;
  restante: number | null;
  precio: string;
}

const DEFAULT_PLANS = [
  { nombre: 'Básico', limite_facturas_mensual: 50, precio: '29.99' },
  { nombre: 'Profesional', limite_facturas_mensual: 200, precio: '79.99' },
  { nombre: 'Empresarial', limite_facturas_mensual: null, precio: '199.99' },
];

@Injectable()
export class PlanesService implements OnModuleInit {
  private readonly logger = new Logger(PlanesService.name);

  constructor(
    @InjectRepository(Plan)
    private readonly planRepo: Repository<Plan>,
    @InjectRepository(UsoMensual)
    private readonly usoMensualRepo: Repository<UsoMensual>,
    @InjectRepository(Empresa)
    private readonly empresaRepo: Repository<Empresa>,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.seedDefaultPlans();
  }

  async seedDefaultPlans(): Promise<void> {
    for (const planData of DEFAULT_PLANS) {
      const existing = await this.planRepo.findOne({
        where: { nombre: planData.nombre },
      });

      if (!existing) {
        const plan = this.planRepo.create({
          nombre: planData.nombre,
          limite_facturas_mensual: planData.limite_facturas_mensual,
          precio: planData.precio,
          activo: true,
        });
        await this.planRepo.save(plan);
        this.logger.log(`Plan "${planData.nombre}" creado`);
      }
    }
  }

  async findAll(): Promise<Plan[]> {
    return this.planRepo.find({ order: { precio: 'ASC' } });
  }

  async crearPlan(data: { nombre: string; limite_facturas_mensual: number | null; precio: number }): Promise<Plan> {
    const plan = this.planRepo.create({
      nombre: data.nombre,
      limite_facturas_mensual: data.limite_facturas_mensual,
      precio: String(data.precio),
      activo: true,
    });
    return this.planRepo.save(plan);
  }

  async editarPlan(id: string, data: { nombre?: string; limite_facturas_mensual?: number | null; precio?: number; activo?: boolean }): Promise<Plan> {
    const plan = await this.planRepo.findOne({ where: { id } });
    if (!plan) throw new Error('Plan no encontrado');
    if (data.nombre !== undefined) plan.nombre = data.nombre;
    if (data.limite_facturas_mensual !== undefined) plan.limite_facturas_mensual = data.limite_facturas_mensual;
    if (data.precio !== undefined) plan.precio = String(data.precio);
    if (data.activo !== undefined) plan.activo = data.activo;
    return this.planRepo.save(plan);
  }

  async findById(id: string): Promise<Plan | null> {
    return this.planRepo.findOne({ where: { id } });
  }

  async getOrCreateUsoMensual(empresaId: string): Promise<UsoMensual> {
    const now = new Date();
    const anio = now.getFullYear();
    const mes = now.getMonth() + 1;

    // Try to find existing record
    let uso = await this.usoMensualRepo.findOne({
      where: { empresa_id: empresaId, anio, mes },
    });

    if (uso) {
      return uso;
    }

    // Get current plan info for the empresa
    const empresa = await this.empresaRepo.findOne({
      where: { id: empresaId },
      relations: ['plan'],
    });

    const planNombre = empresa?.plan?.nombre ?? 'Básico';
    const limiteAplicado = empresa?.plan?.limite_facturas_mensual ?? null;

    // Insert with ON CONFLICT handling via upsert-like approach
    try {
      uso = this.usoMensualRepo.create({
        empresa_id: empresaId,
        anio,
        mes,
        facturas_generadas: 0,
        limite_aplicado: limiteAplicado,
        plan_nombre: planNombre,
      });
      await this.usoMensualRepo.save(uso);
    } catch {
      // Race condition: another request created it first
      uso = await this.usoMensualRepo.findOne({
        where: { empresa_id: empresaId, anio, mes },
      });
      if (!uso) {
        throw new Error('No se pudo crear o encontrar el registro de uso mensual');
      }
    }

    return uso;
  }

  async verificarLimite(empresaId: string): Promise<void> {
    const uso = await this.getOrCreateUsoMensual(empresaId);

    // If limite_aplicado is NULL, plan is unlimited
    if (uso.limite_aplicado === null) {
      return;
    }

    if (uso.facturas_generadas >= uso.limite_aplicado) {
      throw new HttpException(
        {
          statusCode: HttpStatus.PAYMENT_REQUIRED,
          message: 'Límite de facturas mensuales alcanzado. Actualice su plan para continuar.',
          error: 'Payment Required',
          limite: uso.limite_aplicado,
          usado: uso.facturas_generadas,
        },
        HttpStatus.PAYMENT_REQUIRED,
      );
    }
  }

  async incrementarUso(empresaId: string): Promise<void> {
    const now = new Date();
    const anio = now.getFullYear();
    const mes = now.getMonth() + 1;

    // Ensure the record exists first
    await this.getOrCreateUsoMensual(empresaId);

    // Atomic increment
    await this.usoMensualRepo
      .createQueryBuilder()
      .update(UsoMensual)
      .set({ facturas_generadas: () => 'facturas_generadas + 1' })
      .where('empresa_id = :empresaId AND anio = :anio AND mes = :mes', {
        empresaId,
        anio,
        mes,
      })
      .execute();
  }

  async getUsoActual(empresaId: string): Promise<UsoActualResponse> {
    const empresa = await this.empresaRepo.findOne({
      where: { id: empresaId },
      relations: ['plan'],
    });

    if (!empresa) {
      throw new NotFoundException('Empresa no encontrada');
    }

    const uso = await this.getOrCreateUsoMensual(empresaId);

    const limite = uso.limite_aplicado;
    const restante = limite === null ? null : Math.max(0, limite - uso.facturas_generadas);

    return {
      plan_nombre: uso.plan_nombre,
      limite_mensual: limite,
      facturas_generadas: uso.facturas_generadas,
      restante,
      precio: empresa.plan?.precio ?? '0.00',
    };
  }

  async cambiarPlan(empresaId: string, planId: string): Promise<Empresa> {
    const plan = await this.planRepo.findOne({ where: { id: planId } });
    if (!plan) {
      throw new NotFoundException('Plan no encontrado');
    }

    const empresa = await this.empresaRepo.findOne({ where: { id: empresaId } });
    if (!empresa) {
      throw new NotFoundException('Empresa no encontrada');
    }

    empresa.plan_id = planId;
    return this.empresaRepo.save(empresa);
  }
}
