import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { Empresa } from '../../database/entities/empresa.entity.js';
import { ModoNcf } from '../../database/enums.js';
import {
  SecuenciasNcfService,
  AsignacionResult,
} from '../secuencias-ncf/secuencias-ncf.service.js';

/**
 * Regex para validar formato e-NCF.
 * Formato: prefijo (letra(s) mayúscula(s)) + 10 dígitos numéricos.
 * Ejemplos válidos: E310000000001, E320000000015
 */
export const ENCF_FORMAT_REGEX = /^[A-Z]\d{2}\d{8}$/;

export interface EncfValidationResult {
  e_ncf: string;
  secuencia_id: string | null;
  modo: ModoNcf;
}

/**
 * Servicio de validación condicional de e-NCF según el modo configurado de la empresa.
 *
 * - modo_ncf = 'automatico': ignora e_ncf del payload, asigna desde secuencia activa.
 * - modo_ncf = 'manual': requiere e_ncf en payload, valida formato.
 *
 * Req 28.5, 28.6, 28.7, 28.8
 */
@Injectable()
export class EncfValidationService {
  constructor(
    @InjectRepository(Empresa)
    private readonly empresaRepo: Repository<Empresa>,
    private readonly secuenciasNcfService: SecuenciasNcfService,
  ) {}

  /**
   * Valida y resuelve el e-NCF según el modo configurado de la empresa.
   *
   * @param empresaId - ID de la empresa
   * @param encfFromPayload - e-NCF proporcionado en el payload (puede ser undefined/null)
   * @param tipoComprobante - Tipo de comprobante (E31, E32, etc.)
   * @returns El e-NCF resuelto y metadata de asignación
   */
  async resolveEncf(
    empresaId: string,
    encfFromPayload: string | undefined | null,
    tipoComprobante: string,
  ): Promise<EncfValidationResult> {
    const empresa = await this.empresaRepo.findOne({
      where: { id: empresaId },
      select: ['id', 'modo_ncf'],
    });

    if (!empresa) {
      throw new BadRequestException('Empresa no encontrada');
    }

    if (empresa.modo_ncf === ModoNcf.AUTOMATICO) {
      return this.handleAutomaticMode(empresaId, tipoComprobante);
    }

    return this.handleManualMode(encfFromPayload);
  }

  /**
   * Modo automático: ignora e_ncf del payload, asigna desde secuencia.
   * Req 28.5, 28.7
   */
  private async handleAutomaticMode(
    empresaId: string,
    tipoComprobante: string,
  ): Promise<EncfValidationResult> {
    const asignacion: AsignacionResult = await this.secuenciasNcfService.asignarSiguiente(
      empresaId,
      tipoComprobante,
    );

    return {
      e_ncf: asignacion.e_ncf,
      secuencia_id: asignacion.secuencia_id,
      modo: ModoNcf.AUTOMATICO,
    };
  }

  /**
   * Modo manual: requiere e_ncf en payload, valida formato.
   * Req 28.6
   */
  private handleManualMode(encfFromPayload: string | undefined | null): EncfValidationResult {
    if (!encfFromPayload || encfFromPayload.trim().length === 0) {
      throw new BadRequestException('El campo e_ncf es requerido cuando modo_ncf es "manual"');
    }

    if (!ENCF_FORMAT_REGEX.test(encfFromPayload)) {
      throw new BadRequestException(
        'Formato de e_ncf inválido. Debe ser una letra mayúscula seguida de 2 dígitos de tipo y 8 dígitos numéricos (ej: E310000000001)',
      );
    }

    return {
      e_ncf: encfFromPayload,
      secuencia_id: null,
      modo: ModoNcf.MANUAL,
    };
  }

  /**
   * Valida formato de e-NCF sin consultar la empresa.
   * Útil para validaciones estáticas.
   */
  static validateFormat(encf: string): boolean {
    return ENCF_FORMAT_REGEX.test(encf);
  }
}
