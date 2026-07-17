import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { Auditoria } from '../../database/entities/auditoria.entity.js';
import type {
  RegistrarAuditoriaDto,
  ListAuditoriaQueryDto,
  ListAuditoriaGlobalQueryDto,
} from './dto/auditoria.schemas.js';

export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

@Injectable()
export class AuditoriaService {
  constructor(
    @InjectRepository(Auditoria)
    private readonly auditoriaRepo: Repository<Auditoria>,
  ) {}

  /**
   * Registrar un evento de auditoría.
   * Solo se invoca internamente por otros servicios.
   * Req 31.1, 31.2, 31.5, 31.6
   */
  async registrar(data: RegistrarAuditoriaDto): Promise<Auditoria> {
    const registro = this.auditoriaRepo.create({
      empresa_id: data.empresa_id ?? null,
      usuario_id: data.usuario_id ?? null,
      api_key_id: data.api_key_id ?? null,
      accion: data.accion,
      recurso_tipo: data.recurso_tipo,
      recurso_id: data.recurso_id ?? null,
      datos_anteriores: data.datos_anteriores ?? null,
      datos_nuevos: data.datos_nuevos ?? null,
      ip_origen: data.ip_origen ?? null,
      correlation_id: data.correlation_id ?? null,
    });

    return this.auditoriaRepo.save(registro);
  }

  /**
   * Listar registros de auditoría para una empresa específica.
   * Paginado con filtros opcionales.
   * Req 31.3
   */
  async listar(
    empresaId: string,
    filters: ListAuditoriaQueryDto,
  ): Promise<PaginatedResult<Auditoria>> {
    const qb = this.auditoriaRepo.createQueryBuilder('auditoria');

    qb.where('auditoria.empresa_id = :empresaId', { empresaId });

    if (filters.accion) {
      qb.andWhere('auditoria.accion = :accion', { accion: filters.accion });
    }

    if (filters.fecha_desde) {
      qb.andWhere('auditoria.created_at >= :fechaDesde', {
        fechaDesde: filters.fecha_desde,
      });
    }

    if (filters.fecha_hasta) {
      qb.andWhere('auditoria.created_at <= :fechaHasta', {
        fechaHasta: filters.fecha_hasta,
      });
    }

    if (filters.usuario_id) {
      qb.andWhere('auditoria.usuario_id = :usuarioId', {
        usuarioId: filters.usuario_id,
      });
    }

    const page = filters.page ?? 1;
    const limit = filters.limit ?? 20;

    qb.orderBy('auditoria.created_at', 'DESC');
    qb.skip((page - 1) * limit);
    qb.take(limit);

    const [data, total] = await qb.getManyAndCount();

    return {
      data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * Listar registros de auditoría cross-empresa (Super_Admin).
   * Paginado con filtros opcionales incluyendo empresa_id.
   * Req 31.4
   */
  async listarGlobal(
    filters: ListAuditoriaGlobalQueryDto,
  ): Promise<PaginatedResult<Auditoria>> {
    const qb = this.auditoriaRepo.createQueryBuilder('auditoria');

    if (filters.empresa_id) {
      qb.where('auditoria.empresa_id = :empresaId', {
        empresaId: filters.empresa_id,
      });
    }

    if (filters.accion) {
      qb.andWhere('auditoria.accion = :accion', { accion: filters.accion });
    }

    if (filters.fecha_desde) {
      qb.andWhere('auditoria.created_at >= :fechaDesde', {
        fechaDesde: filters.fecha_desde,
      });
    }

    if (filters.fecha_hasta) {
      qb.andWhere('auditoria.created_at <= :fechaHasta', {
        fechaHasta: filters.fecha_hasta,
      });
    }

    if (filters.usuario_id) {
      qb.andWhere('auditoria.usuario_id = :usuarioId', {
        usuarioId: filters.usuario_id,
      });
    }

    const page = filters.page ?? 1;
    const limit = filters.limit ?? 20;

    qb.orderBy('auditoria.created_at', 'DESC');
    qb.skip((page - 1) * limit);
    qb.take(limit);

    const [data, total] = await qb.getManyAndCount();

    return {
      data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }
}
