import { ApiTags } from '@nestjs/swagger';
import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
  ParseUUIDPipe,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { SuperAdminGuard } from '../../common/guards/super-admin.guard.js';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe.js';
import { PlanesService } from '../planes/planes.service.js';
import { CambiarPlanSchema, type CambiarPlanDto } from './dto/admin.schemas.js';
import { Empresa } from '../../database/entities/empresa.entity.js';
import { SecuenciaNcf } from '../../database/entities/secuencia-ncf.entity.js';

@ApiTags('Admin')
@Controller('api/v1/admin')
@UseGuards(JwtAuthGuard, SuperAdminGuard)
export class AdminController {
  constructor(
    private readonly planesService: PlanesService,
    @InjectRepository(Empresa)
    private readonly empresaRepo: Repository<Empresa>,
    @InjectRepository(SecuenciaNcf)
    private readonly secuenciaRepo: Repository<SecuenciaNcf>,
  ) {}

  /**
   * GET /api/v1/admin/empresas
   * Lista todas las empresas del sistema con info básica.
   * Solo Super_Admin.
   */
  @Get('empresas')
  @HttpCode(HttpStatus.OK)
  async listarEmpresas() {
    const empresas = await this.empresaRepo.find({
      select: ['id', 'nombre', 'rnc', 'estado', 'ambiente_dgii', 'plan_id', 'created_at'],
      relations: ['plan'],
      order: { created_at: 'DESC' },
    });

    return empresas.map((e) => ({
      id: e.id,
      nombre: e.nombre,
      rnc: e.rnc,
      estado: e.estado,
      ambiente_dgii: e.ambiente_dgii,
      plan_id: e.plan_id,
      plan_nombre: e.plan?.nombre || null,
      created_at: e.created_at,
    }));
  }

  /**
   * GET /api/v1/admin/planes
   * Lista todos los planes disponibles. Solo Super_Admin.
   * Req 27.7
   */
  @Get('planes')
  @HttpCode(HttpStatus.OK)
  async getPlanes() {
    return this.planesService.findAll();
  }

  /**
   * POST /api/v1/admin/planes
   * Crear un nuevo plan. Solo Super_Admin.
   */
  @Post('planes')
  @HttpCode(HttpStatus.CREATED)
  async crearPlan(@Body() body: { nombre: string; limite_facturas_mensual: number | null; precio: number }) {
    return this.planesService.crearPlan(body);
  }

  /**
   * PATCH /api/v1/admin/planes/:id
   * Editar un plan existente. Solo Super_Admin.
   */
  @Patch('planes/:id')
  @HttpCode(HttpStatus.OK)
  async editarPlan(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: { nombre?: string; limite_facturas_mensual?: number | null; precio?: number; activo?: boolean },
  ) {
    return this.planesService.editarPlan(id, body);
  }

  /**
   * PATCH /api/v1/admin/empresas/:id/plan
   * Cambia el plan de una empresa. Solo Super_Admin.
   * Req 27.6
   */
  @Patch('empresas/:id/plan')
  @HttpCode(HttpStatus.OK)
  async cambiarPlan(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(CambiarPlanSchema)) dto: CambiarPlanDto,
  ) {
    const empresa = await this.planesService.cambiarPlan(id, dto.plan_id);
    return {
      message: 'Plan actualizado exitosamente',
      empresa_id: empresa.id,
      plan_id: empresa.plan_id,
    };
  }

  /**
   * PATCH /api/v1/admin/empresas/:id/promover
   * Promueve una empresa de certificación a producción.
   * Desactiva secuencias NCF de certificación.
   * Solo Super_Admin.
   */
  @Patch('empresas/:id/promover')
  @HttpCode(HttpStatus.OK)
  async promoverAProduccion(@Param('id', new ParseUUIDPipe()) id: string) {
    const empresa = await this.empresaRepo.findOne({ where: { id } });
    if (!empresa) {
      throw new NotFoundException('Empresa no encontrada');
    }

    if (empresa.ambiente_dgii === 'produccion') {
      return {
        message: 'La empresa ya está en ambiente de producción',
        empresa_id: empresa.id,
        ambiente_dgii: empresa.ambiente_dgii,
      };
    }

    // 1. Update empresa ambiente_dgii to 'produccion'
    empresa.ambiente_dgii = 'produccion';
    await this.empresaRepo.save(empresa);

    // 2. Deactivate all secuencias_ncf where ambiente='certificacion' for this empresa
    await this.secuenciaRepo.update(
      { empresa_id: id, ambiente: 'certificacion' },
      { activo: false },
    );

    return {
      message: 'Empresa promovida a producción exitosamente. Secuencias de certificación desactivadas.',
      empresa_id: empresa.id,
      ambiente_dgii: empresa.ambiente_dgii,
    };
  }
}
