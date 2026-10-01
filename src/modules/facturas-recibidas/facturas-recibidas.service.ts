import {
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  FacturaRecibida,
  EstadoAprobacion,
} from '../../database/entities/factura-recibida.entity.js';
import { Empresa } from '../../database/entities/empresa.entity.js';
import type { CreateFacturaRecibidaDto } from './dto/factura-recibida.schemas.js';
import {
  AprobacionComercialService,
  EstadoAcecf,
} from '../../dgii/aprobacion-comercial.service.js';
import { getCorrelationId } from '../../common/interceptors/correlation-id.interceptor.js';

@Injectable()
export class FacturasRecibidasService {
  constructor(
    @InjectRepository(FacturaRecibida)
    private readonly repo: Repository<FacturaRecibida>,
    @InjectRepository(Empresa)
    private readonly empresaRepo: Repository<Empresa>,
    private readonly aprobacionComercialService: AprobacionComercialService,
  ) {}

  async listar(empresaId: string) {
    return this.repo.find({
      where: { empresa_id: empresaId },
      order: { created_at: 'DESC' },
    });
  }

  async registrar(dto: CreateFacturaRecibidaDto, empresaId: string) {
    const entity = this.repo.create({
      empresa_id: empresaId,
      rnc_emisor: dto.rnc_emisor,
      nombre_emisor: dto.nombre_emisor,
      e_ncf: dto.e_ncf,
      fecha_emision: dto.fecha_emision,
      monto_total: dto.monto_total,
      estado_aprobacion: EstadoAprobacion.PENDIENTE,
    });
    return this.repo.save(entity);
  }

  /**
   * Aprueba comercialmente un e-CF recibido y transmite la Aprobación Comercial
   * (ACECF) a la DGII usando el certificado de la empresa compradora.
   */
  async aprobar(id: string, empresaId: string) {
    const factura = await this.findOneOrFail(id, empresaId);
    const empresa = await this.getEmpresaOrFail(empresaId);

    const resultado = await this.aprobacionComercialService.aprobar({
      empresa_id: empresaId,
      rnc_comprador: empresa.rnc,
      rnc_emisor: factura.rnc_emisor,
      e_ncf: factura.e_ncf,
      fecha_emision: factura.fecha_emision,
      monto_total: Number(factura.monto_total),
      estado: EstadoAcecf.APROBADO,
      correlation_id: getCorrelationId() ?? 'no-correlation',
      ambiente: empresa.ambiente_dgii ?? factura.ambiente,
    });

    if (!resultado.exito) {
      throw new UnprocessableEntityException({
        message: 'La DGII rechazó la Aprobación Comercial',
        error_dgii: resultado.error_dgii ?? null,
      });
    }

    factura.estado_aprobacion = EstadoAprobacion.APROBADA;
    factura.track_id_aprobacion = `ACECF-${Date.now()}`;
    return this.repo.save(factura);
  }

  /**
   * Rechaza comercialmente un e-CF recibido y transmite la Aprobación Comercial
   * (ACECF) con estado "rechazado" a la DGII.
   */
  async rechazar(id: string, empresaId: string, motivo: string) {
    const factura = await this.findOneOrFail(id, empresaId);
    const empresa = await this.getEmpresaOrFail(empresaId);

    const resultado = await this.aprobacionComercialService.aprobar({
      empresa_id: empresaId,
      rnc_comprador: empresa.rnc,
      rnc_emisor: factura.rnc_emisor,
      e_ncf: factura.e_ncf,
      fecha_emision: factura.fecha_emision,
      monto_total: Number(factura.monto_total),
      estado: EstadoAcecf.RECHAZADO,
      detalle_motivo: motivo,
      correlation_id: getCorrelationId() ?? 'no-correlation',
      ambiente: empresa.ambiente_dgii ?? factura.ambiente,
    });

    if (!resultado.exito) {
      throw new UnprocessableEntityException({
        message: 'La DGII rechazó la Aprobación Comercial',
        error_dgii: resultado.error_dgii ?? null,
      });
    }

    factura.estado_aprobacion = EstadoAprobacion.RECHAZADA;
    factura.motivo_rechazo = motivo;
    factura.track_id_aprobacion = `ACECF-${Date.now()}`;
    return this.repo.save(factura);
  }

  private async findOneOrFail(id: string, empresaId: string): Promise<FacturaRecibida> {
    const factura = await this.repo.findOne({
      where: { id, empresa_id: empresaId },
    });
    if (!factura) {
      throw new NotFoundException('Factura recibida no encontrada');
    }
    return factura;
  }

  private async getEmpresaOrFail(empresaId: string): Promise<Empresa> {
    const empresa = await this.empresaRepo.findOne({ where: { id: empresaId } });
    if (!empresa) {
      throw new NotFoundException('Empresa no encontrada');
    }
    return empresa;
  }
}
