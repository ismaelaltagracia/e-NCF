import { Injectable, ConflictException, NotFoundException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';

import { SecuenciaNcf } from '../../database/entities/secuencia-ncf.entity.js';
import type { CreateSecuenciaNcfDto } from './dto/secuencias-ncf.schemas.js';

export interface SecuenciaEstado {
  id: string;
  tipo_comprobante: string;
  prefijo: string;
  numero_inicio: number;
  numero_fin: number;
  numero_actual: number;
  restantes: number;
  porcentaje_usado: number;
}

export interface AsignacionResult {
  e_ncf: string;
  secuencia_id: string;
}

@Injectable()
export class SecuenciasNcfService {
  private readonly logger = new Logger(SecuenciasNcfService.name);

  constructor(
    @InjectRepository(SecuenciaNcf)
    private readonly secuenciaRepo: Repository<SecuenciaNcf>,
    private readonly dataSource: DataSource,
  ) {}

  /**
   * Crear una nueva secuencia NCF.
   * Req 28.2
   */
  async create(empresaId: string, dto: CreateSecuenciaNcfDto): Promise<SecuenciaNcf> {
    const secuencia = this.secuenciaRepo.create({
      empresa_id: empresaId,
      tipo_comprobante: dto.tipo_comprobante,
      prefijo: dto.prefijo,
      numero_inicio: dto.numero_inicio.toString(),
      numero_fin: dto.numero_fin.toString(),
      numero_actual: dto.numero_inicio.toString(),
      activo: true,
    });

    return this.secuenciaRepo.save(secuencia);
  }

  /**
   * Listar secuencias NCF de una empresa con números restantes.
   * Req 28.3
   */
  async list(empresaId: string): Promise<Array<SecuenciaNcf & { restantes: number }>> {
    const secuencias = await this.secuenciaRepo.find({
      where: { empresa_id: empresaId },
      order: { created_at: 'DESC' },
    });

    return secuencias.map((s) => ({
      ...s,
      restantes: Number(s.numero_fin) - Number(s.numero_actual) + 1,
    }));
  }

  /**
   * Desactivar una secuencia NCF.
   * Req 28.4
   */
  async deactivate(id: string, empresaId: string): Promise<SecuenciaNcf> {
    const secuencia = await this.secuenciaRepo.findOne({ where: { id, empresa_id: empresaId } });

    if (!secuencia) {
      throw new NotFoundException('Secuencia NCF no encontrada');
    }

    secuencia.activo = false;
    return this.secuenciaRepo.save(secuencia);
  }

  /**
   * Actualizar una secuencia NCF (prefijo, numero_fin, numero_actual, activo).
   */
  async update(
    id: string,
    empresaId: string,
    dto: { activo?: boolean; prefijo?: string; numero_fin?: number; numero_actual?: number },
  ): Promise<SecuenciaNcf> {
    const secuencia = await this.secuenciaRepo.findOne({ where: { id, empresa_id: empresaId } });

    if (!secuencia) {
      throw new NotFoundException('Secuencia NCF no encontrada');
    }

    if (dto.activo !== undefined) secuencia.activo = dto.activo;
    if (dto.prefijo !== undefined) secuencia.prefijo = dto.prefijo;
    if (dto.numero_fin !== undefined) secuencia.numero_fin = String(dto.numero_fin) as any;
    if (dto.numero_actual !== undefined) secuencia.numero_actual = String(dto.numero_actual) as any;

    return this.secuenciaRepo.save(secuencia);
  }

  /**
   * Obtener estado/resumen de capacidad restante de secuencias activas.
   * Req 28.13
   */
  async getEstado(empresaId: string): Promise<SecuenciaEstado[]> {
    const secuencias = await this.secuenciaRepo.find({
      where: { empresa_id: empresaId, activo: true },
      order: { tipo_comprobante: 'ASC' },
    });

    return secuencias.map((s) => {
      const inicio = Number(s.numero_inicio);
      const fin = Number(s.numero_fin);
      const actual = Number(s.numero_actual);
      const total = fin - inicio + 1;
      const usados = actual - inicio;
      const restantes = fin - actual + 1;
      const porcentajeUsado = total > 0 ? Math.round((usados / total) * 10000) / 100 : 0;

      return {
        id: s.id,
        tipo_comprobante: s.tipo_comprobante,
        prefijo: s.prefijo,
        numero_inicio: inicio,
        numero_fin: fin,
        numero_actual: actual,
        restantes,
        porcentaje_usado: porcentajeUsado,
      };
    });
  }

  /**
   * Asignar atómicamente el siguiente e-NCF usando SELECT FOR UPDATE.
   * Req 28.7, 28.9, 28.10, 28.11, 28.14
   */
  async asignarSiguiente(empresaId: string, tipoComprobante: string): Promise<AsignacionResult> {
    return this.dataSource.transaction(async (manager) => {
      const secuencia = await manager
        .createQueryBuilder(SecuenciaNcf, 'seq')
        .setLock('pessimistic_write')
        .where('seq.empresa_id = :empresaId', { empresaId })
        .andWhere('seq.tipo_comprobante = :tipoComprobante', { tipoComprobante })
        .andWhere('seq.activo = :activo', { activo: true })
        .getOne();

      if (!secuencia) {
        throw new ConflictException(
          `No existe secuencia NCF activa para tipo_comprobante ${tipoComprobante}`,
        );
      }

      const actual = Number(secuencia.numero_actual);
      const fin = Number(secuencia.numero_fin);
      const inicio = Number(secuencia.numero_inicio);

      if (actual > fin) {
        throw new ConflictException(
          `Secuencia NCF agotada para tipo_comprobante ${tipoComprobante}`,
        );
      }

      // Formatear e-NCF: prefijo + LPAD(numero_actual, 10, '0')
      const eNcf = secuencia.prefijo + actual.toString().padStart(10, '0');

      // Incrementar numero_actual
      secuencia.numero_actual = (actual + 1).toString();
      await manager.save(SecuenciaNcf, secuencia);

      // Warning al 90% de uso (Req 28.14)
      const umbral90 = inicio + Math.floor(0.9 * (fin - inicio));
      if (actual >= umbral90) {
        const restantes = fin - actual;
        this.logger.warn(
          `Secuencia NCF al 90%+ de uso - empresa_id: ${empresaId}, ` +
            `tipo_comprobante: ${tipoComprobante}, restantes: ${restantes}`,
        );
      }

      return { e_ncf: eNcf, secuencia_id: secuencia.id };
    });
  }
}
