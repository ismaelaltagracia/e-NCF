import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { CatalogoItem } from '../../database/entities/catalogo-item.entity.js';
import type { CreateCatalogoItemDto, UpdateCatalogoItemDto } from './dto/catalogo.schemas.js';

export interface ListCatalogoFilters {
  tipo?: string;
  activo?: boolean;
  search?: string;
}

@Injectable()
export class CatalogoService {
  constructor(
    @InjectRepository(CatalogoItem)
    private readonly catalogoRepo: Repository<CatalogoItem>,
  ) {}

  /**
   * Crear un ítem en el catálogo.
   * Req 25.1
   */
  async create(empresaId: string, dto: CreateCatalogoItemDto): Promise<CatalogoItem> {
    const item = this.catalogoRepo.create({
      empresa_id: empresaId,
      tipo: dto.tipo,
      codigo: dto.codigo,
      descripcion: dto.descripcion,
      precio_unitario: dto.precio_unitario.toFixed(2),
      tasa_itbis: dto.tasa_itbis,
      activo: true,
    });

    return this.catalogoRepo.save(item);
  }

  /**
   * Listar ítems del catálogo con filtros opcionales.
   * Solo devuelve ítems de la empresa autenticada.
   * Req 25.2, 25.6, 25.9
   */
  async list(empresaId: string, filters: ListCatalogoFilters): Promise<CatalogoItem[]> {
    const qb = this.catalogoRepo.createQueryBuilder('item');

    qb.where('item.empresa_id = :empresaId', { empresaId });

    if (filters.tipo) {
      qb.andWhere('item.tipo = :tipo', { tipo: filters.tipo });
    }

    if (filters.activo !== undefined) {
      qb.andWhere('item.activo = :activo', { activo: filters.activo });
    }

    if (filters.search) {
      qb.andWhere('(item.descripcion ILIKE :search OR item.codigo ILIKE :search)', {
        search: `%${filters.search}%`,
      });
    }

    qb.orderBy('item.created_at', 'DESC');

    return qb.getMany();
  }

  /**
   * Actualizar campos de un ítem del catálogo.
   * Req 25.3, 25.6
   */
  async update(id: string, empresaId: string, dto: UpdateCatalogoItemDto): Promise<CatalogoItem> {
    const item = await this.catalogoRepo.findOne({ where: { id } });

    if (!item) {
      throw new NotFoundException('Ítem de catálogo no encontrado');
    }

    if (item.empresa_id !== empresaId) {
      throw new ForbiddenException('No tiene permisos para modificar ítems de otra empresa');
    }

    if (dto.tipo !== undefined) item.tipo = dto.tipo;
    if (dto.codigo !== undefined) item.codigo = dto.codigo;
    if (dto.descripcion !== undefined) item.descripcion = dto.descripcion;
    if (dto.precio_unitario !== undefined) item.precio_unitario = dto.precio_unitario.toFixed(2);
    if (dto.tasa_itbis !== undefined) item.tasa_itbis = dto.tasa_itbis;

    return this.catalogoRepo.save(item);
  }

  /**
   * Borrado lógico: establece activo=false.
   * Req 25.4, 25.6
   */
  async softDelete(id: string, empresaId: string): Promise<void> {
    const item = await this.catalogoRepo.findOne({ where: { id } });

    if (!item) {
      throw new NotFoundException('Ítem de catálogo no encontrado');
    }

    if (item.empresa_id !== empresaId) {
      throw new ForbiddenException('No tiene permisos para eliminar ítems de otra empresa');
    }

    item.activo = false;
    await this.catalogoRepo.save(item);
  }
}
