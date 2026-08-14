import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Contador } from '../../database/entities/contador.entity.js';
import { ContadorEmpresa } from '../../database/entities/contador-empresa.entity.js';
import {
  FacturaContador,
  EstadoFacturaContador,
} from '../../database/entities/factura-contador.entity.js';
import { ContadorUsuario } from '../../database/entities/contador-usuario.entity.js';
import { Empresa } from '../../database/entities/empresa.entity.js';
import { Plan } from '../../database/entities/plan.entity.js';
import { EstadoEmpresa } from '../../database/enums.js';

/** Descuento aplicable a partir de la 3ra empresa */
const DESCUENTO_PORCENTAJE = 20;
const EMPRESAS_SIN_DESCUENTO = 2;

@Injectable()
export class ContadorService {
  constructor(
    @InjectRepository(Contador)
    private readonly contadorRepo: Repository<Contador>,
    @InjectRepository(ContadorEmpresa)
    private readonly contadorEmpresaRepo: Repository<ContadorEmpresa>,
    @InjectRepository(FacturaContador)
    private readonly facturaContadorRepo: Repository<FacturaContador>,
    @InjectRepository(ContadorUsuario)
    private readonly contadorUsuarioRepo: Repository<ContadorUsuario>,
    @InjectRepository(Empresa)
    private readonly empresaRepo: Repository<Empresa>,
    @InjectRepository(Plan)
    private readonly planRepo: Repository<Plan>,
  ) {}

  // ─── Registro ───

  async registrar(dto: {
    usuario_id: string;
    nombre_firma: string;
    rnc_firma?: string;
    exequatur?: string;
    email_facturacion: string;
  }) {
    const existing = await this.contadorRepo.findOne({
      where: { usuario_id: dto.usuario_id },
    });
    if (existing) {
      throw new ConflictException('Ya está registrado como contador');
    }

    const contador = this.contadorRepo.create({
      usuario_id: dto.usuario_id,
      nombre_firma: dto.nombre_firma,
      rnc_firma: dto.rnc_firma || null,
      exequatur: dto.exequatur || null,
      email_facturacion: dto.email_facturacion,
    });

    return this.contadorRepo.save(contador);
  }

  async obtenerPerfil(usuarioId: string) {
    const contador = await this.contadorRepo.findOne({
      where: { usuario_id: usuarioId },
    });
    if (!contador) throw new NotFoundException('No registrado como contador');
    return contador;
  }

  async actualizarPerfil(
    usuarioId: string,
    dto: Partial<{ nombre_firma: string; rnc_firma: string; exequatur: string; email_facturacion: string }>,
  ) {
    const contador = await this.obtenerPerfil(usuarioId);
    Object.assign(contador, dto);
    return this.contadorRepo.save(contador);
  }

  // ─── Empresas ───

  async listarEmpresas(usuarioId: string) {
    const contador = await this.obtenerPerfil(usuarioId);
    return this.contadorEmpresaRepo.find({
      where: { contador_id: contador.id, activo: true },
      relations: ['empresa', 'plan'],
      order: { fecha_alta: 'ASC' },
    });
  }

  async crearEmpresa(
    usuarioId: string,
    dto: { nombre: string; rnc: string; plan_id: string },
  ) {
    const contador = await this.obtenerPerfil(usuarioId);

    // Verify plan exists
    const plan = await this.planRepo.findOne({ where: { id: dto.plan_id, activo: true } });
    if (!plan) throw new BadRequestException('Plan no válido');

    // Check RNC not already registered
    const existingEmpresa = await this.empresaRepo.findOne({ where: { rnc: dto.rnc } });
    if (existingEmpresa) {
      throw new ConflictException('Ya existe una empresa con ese RNC');
    }

    // Create empresa
    const empresa = this.empresaRepo.create({
      nombre: dto.nombre,
      rnc: dto.rnc,
      estado: EstadoEmpresa.CERTIFICACION,
      plan_id: dto.plan_id,
    });
    const savedEmpresa = await this.empresaRepo.save(empresa);

    // Link to contador
    const link = this.contadorEmpresaRepo.create({
      contador_id: contador.id,
      empresa_id: savedEmpresa.id,
      plan_id: dto.plan_id,
      activo: true,
      fecha_alta: new Date().toISOString().substring(0, 10),
    });
    await this.contadorEmpresaRepo.save(link);

    return { empresa: savedEmpresa, vinculo: link };
  }

  async desvincularEmpresa(usuarioId: string, empresaId: string) {
    const contador = await this.obtenerPerfil(usuarioId);
    const link = await this.contadorEmpresaRepo.findOne({
      where: { contador_id: contador.id, empresa_id: empresaId, activo: true },
    });
    if (!link) throw new NotFoundException('Empresa no vinculada');

    link.activo = false;
    link.fecha_baja = new Date().toISOString().substring(0, 10);
    await this.contadorEmpresaRepo.save(link);

    return { message: 'Empresa desvinculada' };
  }

  async cambiarPlanEmpresa(usuarioId: string, empresaId: string, nuevoPlanId: string) {
    const contador = await this.obtenerPerfil(usuarioId);
    const link = await this.contadorEmpresaRepo.findOne({
      where: { contador_id: contador.id, empresa_id: empresaId, activo: true },
    });
    if (!link) throw new NotFoundException('Empresa no vinculada');

    const plan = await this.planRepo.findOne({ where: { id: nuevoPlanId, activo: true } });
    if (!plan) throw new BadRequestException('Plan no válido');

    link.plan_id = nuevoPlanId;
    await this.contadorEmpresaRepo.save(link);

    // Update empresa's plan too
    await this.empresaRepo.update(empresaId, { plan_id: nuevoPlanId });

    return { message: 'Plan actualizado', plan: plan.nombre };
  }

  // ─── Cambio de contexto ───

  async validarEmpresaPertenece(usuarioId: string, empresaId: string): Promise<boolean> {
    const contador = await this.contadorRepo.findOne({ where: { usuario_id: usuarioId } });
    if (!contador) return false;

    const link = await this.contadorEmpresaRepo.findOne({
      where: { contador_id: contador.id, empresa_id: empresaId, activo: true },
    });
    return !!link;
  }

  // ─── Facturación ───

  async previewFacturaMes(usuarioId: string) {
    const contador = await this.obtenerPerfil(usuarioId);
    const empresas = await this.contadorEmpresaRepo.find({
      where: { contador_id: contador.id, activo: true },
      relations: ['empresa', 'plan'],
      order: { fecha_alta: 'ASC' },
    });

    return this.calcularFactura(empresas);
  }

  async generarFacturaMensual(contadorId: string, periodo: string) {
    const empresas = await this.contadorEmpresaRepo.find({
      where: { contador_id: contadorId, activo: true },
      relations: ['empresa', 'plan'],
      order: { fecha_alta: 'ASC' },
    });

    if (empresas.length === 0) return null;

    const calculo = this.calcularFactura(empresas);

    const factura = this.facturaContadorRepo.create({
      contador_id: contadorId,
      periodo,
      subtotal: calculo.subtotal,
      descuento: calculo.descuento_total,
      total: calculo.total,
      estado: EstadoFacturaContador.PENDIENTE,
      detalle: calculo.detalle,
    });

    return this.facturaContadorRepo.save(factura);
  }

  async listarFacturas(usuarioId: string) {
    const contador = await this.obtenerPerfil(usuarioId);
    return this.facturaContadorRepo.find({
      where: { contador_id: contador.id },
      order: { created_at: 'DESC' },
    });
  }

  // ─── Usuarios del equipo ───

  async crearUsuarioEquipo(
    contadorUsuarioId: string,
    dto: { usuario_id: string; rol: string; empresa_ids: string[] },
  ) {
    const contador = await this.obtenerPerfil(contadorUsuarioId);

    // Verify all empresas belong to this contador
    for (const empresaId of dto.empresa_ids) {
      const link = await this.contadorEmpresaRepo.findOne({
        where: { contador_id: contador.id, empresa_id: empresaId, activo: true },
      });
      if (!link) {
        throw new BadRequestException(`Empresa ${empresaId} no pertenece a su cuenta`);
      }
    }

    // Create one record per empresa
    const records = dto.empresa_ids.map((empresaId) =>
      this.contadorUsuarioRepo.create({
        contador_id: contador.id,
        usuario_id: dto.usuario_id,
        empresa_id: empresaId,
        rol: dto.rol,
        activo: true,
      }),
    );

    const saved = await this.contadorUsuarioRepo.save(records);
    return { usuario_id: dto.usuario_id, empresas_asignadas: dto.empresa_ids.length, registros: saved.length };
  }

  async listarUsuariosEquipo(contadorUsuarioId: string) {
    const contador = await this.obtenerPerfil(contadorUsuarioId);
    const registros = await this.contadorUsuarioRepo.find({
      where: { contador_id: contador.id, activo: true },
      relations: ['usuario', 'empresa'],
      order: { usuario_id: 'ASC' },
    });

    // Group by usuario_id
    const grouped = new Map<string, { usuario_id: string; nombre: string; email: string; rol: string; empresas: string[] }>();
    for (const r of registros) {
      if (!grouped.has(r.usuario_id)) {
        grouped.set(r.usuario_id, {
          usuario_id: r.usuario_id,
          nombre: r.usuario?.nombre ?? '',
          email: r.usuario?.email ?? '',
          rol: r.rol,
          empresas: [],
        });
      }
      grouped.get(r.usuario_id)!.empresas.push(r.empresa?.nombre ?? r.empresa_id);
    }

    return Array.from(grouped.values());
  }

  async eliminarUsuarioEquipo(contadorUsuarioId: string, usuarioId: string) {
    const contador = await this.obtenerPerfil(contadorUsuarioId);
    await this.contadorUsuarioRepo.update(
      { contador_id: contador.id, usuario_id: usuarioId },
      { activo: false },
    );
    return { message: 'Usuario desactivado', usuario_id: usuarioId };
  }

  async obtenerEmpresasDeUsuario(contadorId: string, usuarioId: string): Promise<string[]> {
    const registros = await this.contadorUsuarioRepo.find({
      where: { contador_id: contadorId, usuario_id: usuarioId, activo: true },
    });
    return registros.map((r) => r.empresa_id);
  }

  // ─── Cálculo interno ───

  private calcularFactura(empresas: ContadorEmpresa[]) {
    let subtotal = 0;
    let descuentoTotal = 0;
    const detalle: Array<{
      empresa_id: string;
      empresa_nombre: string;
      plan_nombre: string;
      precio_base: number;
      descuento_aplicado: boolean;
      precio_final: number;
    }> = [];

    empresas.forEach((ce, index) => {
      const precioBase = Number(ce.plan?.precio ?? 0);
      const aplicaDescuento = index >= EMPRESAS_SIN_DESCUENTO;
      const descuento = aplicaDescuento
        ? precioBase * (DESCUENTO_PORCENTAJE / 100)
        : 0;
      const precioFinal = precioBase - descuento;

      subtotal += precioBase;
      descuentoTotal += descuento;

      detalle.push({
        empresa_id: ce.empresa_id,
        empresa_nombre: ce.empresa?.nombre ?? '',
        plan_nombre: ce.plan?.nombre ?? '',
        precio_base: precioBase,
        descuento_aplicado: aplicaDescuento,
        precio_final: precioFinal,
      });
    });

    return {
      subtotal: Math.round(subtotal * 100) / 100,
      descuento_total: Math.round(descuentoTotal * 100) / 100,
      total: Math.round((subtotal - descuentoTotal) * 100) / 100,
      cantidad_empresas: empresas.length,
      empresas_con_descuento: Math.max(0, empresas.length - EMPRESAS_SIN_DESCUENTO),
      detalle,
    };
  }
}
