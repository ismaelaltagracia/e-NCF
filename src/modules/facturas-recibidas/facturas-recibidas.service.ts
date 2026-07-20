import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  FacturaRecibida,
  EstadoAprobacion,
} from '../../database/entities/factura-recibida.entity.js';
import type { CreateFacturaRecibidaDto } from './dto/factura-recibida.schemas.js';

@Injectable()
export class FacturasRecibidasService {
  constructor(
    @InjectRepository(FacturaRecibida)
    private readonly repo: Repository<FacturaRecibida>,
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

  async aprobar(id: string, empresaId: string) {
    const factura = await this.findOneOrFail(id, empresaId);
    factura.estado_aprobacion = EstadoAprobacion.APROBADA;
    factura.track_id_aprobacion = `APR-${Date.now()}`;
    return this.repo.save(factura);
  }

  async rechazar(id: string, empresaId: string, motivo: string) {
    const factura = await this.findOneOrFail(id, empresaId);
    factura.estado_aprobacion = EstadoAprobacion.RECHAZADA;
    factura.motivo_rechazo = motivo;
    factura.track_id_aprobacion = `REJ-${Date.now()}`;
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
}
