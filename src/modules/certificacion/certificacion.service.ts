import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { FacturasService } from '../facturas/facturas.service.js';
import { FacturasRecibidasService } from '../facturas-recibidas/facturas-recibidas.service.js';
import { SecuenciasNcfService } from '../secuencias-ncf/secuencias-ncf.service.js';
import { FacturaElectronica } from '../../database/entities/factura-electronica.entity.js';
import { FacturaRecibida } from '../../database/entities/factura-recibida.entity.js';
import { SecuenciaNcf } from '../../database/entities/secuencia-ncf.entity.js';
import type { RequestContext } from '../../common/interfaces/request-context.interface.js';
import type {
  PasoCertificacionResult,
  EjecucionCertificacionResponse,
  ProgresoIntegradorResponse,
  PasoIntegrador,
} from './dto/certificacion.schemas.js';

const PASOS_CERTIFICACION = [
  { paso: 1, nombre: 'E31 Factura Crédito Fiscal (básica)', tipo: 'E31' },
  { paso: 2, nombre: 'E31 Factura Crédito Fiscal (múltiples ítems)', tipo: 'E31' },
  { paso: 3, nombre: 'E31 Factura Crédito Fiscal (con descuento)', tipo: 'E31' },
  { paso: 4, nombre: 'E32 Factura de Consumo', tipo: 'E32' },
  { paso: 5, nombre: 'E32 Factura de Consumo (con ITBIS)', tipo: 'E32' },
  { paso: 6, nombre: 'E33 Nota de Débito', tipo: 'E33' },
  { paso: 7, nombre: 'E34 Nota de Crédito', tipo: 'E34' },
  { paso: 8, nombre: 'E41 Comprobante de Compras', tipo: 'E41' },
  { paso: 9, nombre: 'E43 Gastos Menores', tipo: 'E43' },
  { paso: 10, nombre: 'E44 Regímenes Especiales', tipo: 'E44' },
  { paso: 11, nombre: 'E45 Gubernamental', tipo: 'E45' },
  { paso: 12, nombre: 'Anulación de e-CF', tipo: 'anulacion' },
  { paso: 13, nombre: 'Consulta Estado (Track ID)', tipo: 'consulta_estado' },
  { paso: 14, nombre: 'Aprobación Comercial', tipo: 'aprobacion' },
  { paso: 15, nombre: 'Consulta de Rangos NCF', tipo: 'consulta_rangos' },
];

/** RNC de prueba para receptor */
const RNC_RECEPTOR_PRUEBA = '131793916';

@Injectable()
export class CertificacionService {
  private readonly logger = new Logger(CertificacionService.name);
  private ultimaEjecucion: EjecucionCertificacionResponse | null = null;

  constructor(
    private readonly facturasService: FacturasService,
    private readonly facturasRecibidasService: FacturasRecibidasService,
    private readonly secuenciasNcfService: SecuenciasNcfService,
    @InjectRepository(FacturaElectronica)
    private readonly facturaRepo: Repository<FacturaElectronica>,
    @InjectRepository(FacturaRecibida)
    private readonly facturaRecibidaRepo: Repository<FacturaRecibida>,
    @InjectRepository(SecuenciaNcf)
    private readonly secuenciaNcfRepo: Repository<SecuenciaNcf>,
  ) {}

  /**
   * Tipos de comprobante requeridos para las 15 pruebas y cantidad mínima de NCFs necesarios.
   */
  private static readonly SECUENCIAS_REQUERIDAS: { tipo: string; cantidad_minima: number }[] = [
    { tipo: 'E31', cantidad_minima: 3 },  // Pasos 1, 2, 3
    { tipo: 'E32', cantidad_minima: 2 },  // Pasos 4, 5
    { tipo: 'E33', cantidad_minima: 1 },  // Paso 6
    { tipo: 'E34', cantidad_minima: 1 },  // Paso 7
    { tipo: 'E41', cantidad_minima: 1 },  // Paso 8
    { tipo: 'E43', cantidad_minima: 1 },  // Paso 9
    { tipo: 'E44', cantidad_minima: 1 },  // Paso 10
    { tipo: 'E45', cantidad_minima: 1 },  // Paso 11
  ];

  /**
   * Valida que existan todas las secuencias NCF necesarias para las 15 pruebas.
   * Retorna las secuencias faltantes o con NCFs insuficientes.
   */
  async validarRequisitos(empresaId: string): Promise<{
    valido: boolean;
    secuencias_faltantes: { tipo: string; cantidad_requerida: number; cantidad_disponible: number }[];
    mensaje: string;
  }> {
    const estado = await this.secuenciasNcfService.getEstado(empresaId);
    const faltantes: { tipo: string; cantidad_requerida: number; cantidad_disponible: number }[] = [];

    for (const req of CertificacionService.SECUENCIAS_REQUERIDAS) {
      const secuencia = estado.find((s) => s.tipo_comprobante === req.tipo);
      const disponible = secuencia ? secuencia.restantes : 0;

      if (disponible < req.cantidad_minima) {
        faltantes.push({
          tipo: req.tipo,
          cantidad_requerida: req.cantidad_minima,
          cantidad_disponible: disponible,
        });
      }
    }

    return {
      valido: faltantes.length === 0,
      secuencias_faltantes: faltantes,
      mensaje: faltantes.length === 0
        ? 'Todas las secuencias NCF están configuradas y disponibles'
        : `Faltan ${faltantes.length} secuencia(s): ${faltantes.map((f) => f.tipo).join(', ')}`,
    };
  }

  /**
   * Crea automáticamente las secuencias NCF faltantes para poder ejecutar las pruebas.
   * NOTA: En ambiente real de certificación, las secuencias deben ser las asignadas por la DGII.
   * Este método es solo para pruebas internas/desarrollo.
   */
  async crearSecuenciasFaltantes(empresaId: string): Promise<{ creadas: string[]; nota: string }> {
    const validacion = await this.validarRequisitos(empresaId);
    const creadas: string[] = [];

    for (const faltante of validacion.secuencias_faltantes) {
      try {
        await this.secuenciasNcfService.create(empresaId, {
          tipo_comprobante: faltante.tipo as any,
          prefijo: faltante.tipo,
          numero_inicio: 1,
          numero_fin: 99999999,
        });
        creadas.push(faltante.tipo);
        this.logger.log(`Secuencia ${faltante.tipo} creada automáticamente para empresa ${empresaId}`);
      } catch (error) {
        const msg = error instanceof Error ? error.message : 'Error';
        this.logger.warn(`No se pudo crear secuencia ${faltante.tipo}: ${msg}`);
      }
    }

    return {
      creadas,
      nota: 'IMPORTANTE: En el proceso de certificación real con la DGII, debe usar las secuencias NCF asignadas por la DGII, no las generadas automáticamente. Registre los rangos oficiales en la sección NCF.',
    };
  }

  /**
   * Ejecuta los 15 pasos del set de pruebas de certificación DGII secuencialmente.
   * Valida requisitos antes de iniciar. Si faltan secuencias, las crea automáticamente.
   * Cada paso que falla no detiene la ejecución — se continúa con el siguiente.
   */
  async ejecutarSetDePruebas(user: RequestContext): Promise<EjecucionCertificacionResponse> {
    // Pre-validación: verificar y crear secuencias faltantes automáticamente
    const validacion = await this.validarRequisitos(user.empresa_id);
    if (!validacion.valido) {
      this.logger.log(`Creando secuencias faltantes antes de ejecutar pruebas: ${validacion.secuencias_faltantes.map(f => f.tipo).join(', ')}`);
      await this.crearSecuenciasFaltantes(user.empresa_id);
    }

    const inicio = Date.now();
    const resultados: PasoCertificacionResult[] = [];

    // References needed by later steps
    let eNcfPaso1: string | null = null;
    let trackIdPaso1: string | null = null;
    let facturaIdPaso1: string | null = null;
    let facturaIdPaso4: string | null = null;
    let estadoPaso4: string | null = null;

    for (const paso of PASOS_CERTIFICACION) {
      try {
        const resultado = await this.ejecutarPaso(
          paso,
          user,
          { eNcfPaso1, trackIdPaso1, facturaIdPaso1, facturaIdPaso4, estadoPaso4 },
        );
        resultados.push(resultado);

        // Store references for later steps
        if (paso.paso === 1 && resultado.estado === 'exitoso') {
          eNcfPaso1 = resultado.e_ncf ?? null;
          trackIdPaso1 = resultado.track_id ?? null;
          facturaIdPaso1 = resultado.e_ncf ? resultado.e_ncf : null;
          // Store the actual factura ID from the message
          const idMatch = resultado.mensaje?.match(/ID: ([a-f0-9-]+)/);
          if (idMatch) facturaIdPaso1 = idMatch[1];
        }
        if (paso.paso === 4 && resultado.estado === 'exitoso') {
          const idMatch = resultado.mensaje?.match(/ID: ([a-f0-9-]+)/);
          if (idMatch) facturaIdPaso4 = idMatch[1];
          estadoPaso4 = 'exitoso';
        }
      } catch (error) {
        const msg = error instanceof Error ? error.message : 'Error desconocido';
        this.logger.error(`Paso ${paso.paso} falló con error inesperado: ${msg}`);
        resultados.push({
          paso: paso.paso,
          nombre: paso.nombre,
          estado: 'fallido',
          mensaje: 'Error inesperado',
          error: msg,
        });
      }
    }

    const duracion = Date.now() - inicio;
    const resumen = {
      exitosos: resultados.filter((r) => r.estado === 'exitoso').length,
      fallidos: resultados.filter((r) => r.estado === 'fallido').length,
      omitidos: resultados.filter((r) => r.estado === 'omitido').length,
    };

    const response: EjecucionCertificacionResponse = {
      ejecutado_en: new Date().toISOString(),
      duracion_ms: duracion,
      resumen,
      pasos: resultados,
    };

    this.ultimaEjecucion = response;
    return response;
  }

  /**
   * Retorna el resultado de la última ejecución del set de pruebas.
   */
  getUltimaEjecucion(): EjecucionCertificacionResponse | null {
    return this.ultimaEjecucion;
  }

  /**
   * Consulta el progreso de certificación en modo integrador.
   * Revisa las facturas existentes en la BD para determinar cuáles de los 15 pasos
   * de certificación ya se han completado basándose en facturas reales enviadas via API.
   */
  async getProgresoIntegrador(empresaId: string): Promise<ProgresoIntegradorResponse> {
    const pasos: PasoIntegrador[] = [];

    // Solo contar facturas creadas vía API Key (no desde la SPA)
    const apiOnlyCondition = 'f.api_key_id IS NOT NULL';

    // Step 1: E31 factura básica (at least 1 E31 with 1 item)
    const paso1 = await this.facturaRepo
      .createQueryBuilder('f')
      .where('f.empresa_id = :empresaId', { empresaId })
      .andWhere(apiOnlyCondition)
      .andWhere("f.payload_json->>'tipo_comprobante' = :tipo", { tipo: 'E31' })
      .orderBy('f.created_at', 'ASC')
      .getOne();
    pasos.push(this.buildPasoIntegrador(1, 'E31 Factura básica', paso1, 'Envíe una factura E31 (Crédito Fiscal) usando su API Key'));

    // Step 2: E31 with 3+ items
    const paso2 = await this.facturaRepo
      .createQueryBuilder('f')
      .where('f.empresa_id = :empresaId', { empresaId })
      .andWhere(apiOnlyCondition)
      .andWhere("f.payload_json->>'tipo_comprobante' = :tipo", { tipo: 'E31' })
      .andWhere("jsonb_array_length(f.payload_json->'items') >= 3")
      .orderBy('f.created_at', 'ASC')
      .getOne();
    pasos.push(this.buildPasoIntegrador(2, 'E31 múltiples ítems', paso2, 'Envíe una factura E31 con 3+ ítems usando su API Key'));

    // Step 3: E31 with descuento_global > 0
    const paso3 = await this.facturaRepo
      .createQueryBuilder('f')
      .where('f.empresa_id = :empresaId', { empresaId })
      .andWhere(apiOnlyCondition)
      .andWhere("f.payload_json->>'tipo_comprobante' = :tipo", { tipo: 'E31' })
      .andWhere("(f.payload_json->>'descuento_global')::numeric > 0")
      .orderBy('f.created_at', 'ASC')
      .getOne();
    pasos.push(this.buildPasoIntegrador(3, 'E31 con descuento global', paso3, 'Envíe una factura E31 con descuento_global usando su API Key'));

    // Step 4: E32 factura
    const paso4 = await this.facturaRepo
      .createQueryBuilder('f')
      .where('f.empresa_id = :empresaId', { empresaId })
      .andWhere(apiOnlyCondition)
      .andWhere("f.payload_json->>'tipo_comprobante' = :tipo", { tipo: 'E32' })
      .orderBy('f.created_at', 'ASC')
      .getOne();
    pasos.push(this.buildPasoIntegrador(4, 'E32 Factura de Consumo', paso4, 'Envíe una factura E32 usando su API Key'));

    // Step 5: E32 with items that have tasa_itbis > 0
    const paso5 = await this.facturaRepo
      .createQueryBuilder('f')
      .where('f.empresa_id = :empresaId', { empresaId })
      .andWhere(apiOnlyCondition)
      .andWhere("f.payload_json->>'tipo_comprobante' = :tipo", { tipo: 'E32' })
      .andWhere(`EXISTS (
        SELECT 1 FROM jsonb_array_elements(f.payload_json->'items') item
        WHERE (item->>'tasa_itbis')::numeric > 0
      )`)
      .orderBy('f.created_at', 'ASC')
      .getOne();
    pasos.push(this.buildPasoIntegrador(5, 'E32 con ITBIS', paso5, 'Envíe una factura E32 con ITBIS usando su API Key'));

    // Step 6: E33 Nota Débito with informacion_referencia
    const paso6 = await this.facturaRepo
      .createQueryBuilder('f')
      .where('f.empresa_id = :empresaId', { empresaId })
      .andWhere(apiOnlyCondition)
      .andWhere("f.payload_json->>'tipo_comprobante' = :tipo", { tipo: 'E33' })
      .andWhere("f.payload_json->'informacion_referencia' IS NOT NULL")
      .andWhere("f.payload_json->>'informacion_referencia' != 'null'")
      .orderBy('f.created_at', 'ASC')
      .getOne();
    pasos.push(this.buildPasoIntegrador(6, 'E33 Nota de Débito', paso6, 'Envíe una Nota de Débito (E33) con referencia usando su API Key'));

    // Step 7: E34 Nota Crédito with informacion_referencia
    const paso7 = await this.facturaRepo
      .createQueryBuilder('f')
      .where('f.empresa_id = :empresaId', { empresaId })
      .andWhere(apiOnlyCondition)
      .andWhere("f.payload_json->>'tipo_comprobante' = :tipo", { tipo: 'E34' })
      .andWhere("f.payload_json->'informacion_referencia' IS NOT NULL")
      .andWhere("f.payload_json->>'informacion_referencia' != 'null'")
      .orderBy('f.created_at', 'ASC')
      .getOne();
    pasos.push(this.buildPasoIntegrador(7, 'E34 Nota de Crédito', paso7, 'Envíe una Nota de Crédito (E34) con referencia usando su API Key'));

    // Step 8: E41 factura
    const paso8 = await this.facturaRepo
      .createQueryBuilder('f')
      .where('f.empresa_id = :empresaId', { empresaId })
      .andWhere(apiOnlyCondition)
      .andWhere("f.payload_json->>'tipo_comprobante' = :tipo", { tipo: 'E41' })
      .orderBy('f.created_at', 'ASC')
      .getOne();
    pasos.push(this.buildPasoIntegrador(8, 'E41 Comprobante de Compras', paso8, 'Envíe un Comprobante de Compras (E41) usando su API Key'));

    // Step 9: E43 factura
    const paso9 = await this.facturaRepo
      .createQueryBuilder('f')
      .where('f.empresa_id = :empresaId', { empresaId })
      .andWhere(apiOnlyCondition)
      .andWhere("f.payload_json->>'tipo_comprobante' = :tipo", { tipo: 'E43' })
      .orderBy('f.created_at', 'ASC')
      .getOne();
    pasos.push(this.buildPasoIntegrador(9, 'E43 Gastos Menores', paso9, 'Envíe un comprobante de Gastos Menores (E43) usando su API Key'));

    // Step 10: E44 factura
    const paso10 = await this.facturaRepo
      .createQueryBuilder('f')
      .where('f.empresa_id = :empresaId', { empresaId })
      .andWhere(apiOnlyCondition)
      .andWhere("f.payload_json->>'tipo_comprobante' = :tipo", { tipo: 'E44' })
      .orderBy('f.created_at', 'ASC')
      .getOne();
    pasos.push(this.buildPasoIntegrador(10, 'E44 Regímenes Especiales', paso10, 'Envíe un comprobante de Regímenes Especiales (E44) usando su API Key'));

    // Step 11: E45 factura
    const paso11 = await this.facturaRepo
      .createQueryBuilder('f')
      .where('f.empresa_id = :empresaId', { empresaId })
      .andWhere(apiOnlyCondition)
      .andWhere("f.payload_json->>'tipo_comprobante' = :tipo", { tipo: 'E45' })
      .orderBy('f.created_at', 'ASC')
      .getOne();
    pasos.push(this.buildPasoIntegrador(11, 'E45 Gubernamental', paso11, 'Envíe un comprobante Gubernamental (E45) usando su API Key'));

    // Step 12: Factura with estado_dgii = 'anulado' (created via API)
    const paso12 = await this.facturaRepo
      .createQueryBuilder('f')
      .where('f.empresa_id = :empresaId', { empresaId })
      .andWhere(apiOnlyCondition)
      .andWhere('f.estado_dgii = :estado', { estado: 'anulado' })
      .orderBy('f.created_at', 'ASC')
      .getOne();
    pasos.push(this.buildPasoIntegrador(12, 'Anulación de e-CF', paso12, 'Anule una factura creada vía API Key'));

    // Step 13: Factura with track_id (created via API)
    const paso13 = await this.facturaRepo
      .createQueryBuilder('f')
      .where('f.empresa_id = :empresaId', { empresaId })
      .andWhere(apiOnlyCondition)
      .andWhere('f.track_id IS NOT NULL')
      .orderBy('f.created_at', 'ASC')
      .getOne();
    pasos.push(this.buildPasoIntegrador(13, 'Consulta Estado (Track ID)', paso13, 'Consulte el estado de una factura creada vía API Key'));

    // Step 14: Factura recibida with estado_aprobacion = 'aprobada' or 'rechazada'
    const paso14 = await this.facturaRecibidaRepo
      .createQueryBuilder('fr')
      .where('fr.empresa_id = :empresaId', { empresaId })
      .andWhere('fr.estado_aprobacion IN (:...estados)', { estados: ['aprobada', 'rechazada'] })
      .orderBy('fr.created_at', 'ASC')
      .getOne();
    if (paso14) {
      pasos.push({
        paso: 14,
        nombre: 'Aprobación Comercial',
        completado: true,
        factura_id: paso14.id,
        e_ncf: paso14.e_ncf,
        completado_en: paso14.created_at.toISOString(),
      });
    } else {
      pasos.push({
        paso: 14,
        nombre: 'Aprobación Comercial',
        completado: false,
        requisito: 'Apruebe o rechace al menos una factura recibida',
      });
    }

    // Step 15: Has at least 1 active secuencia NCF
    const paso15 = await this.secuenciaNcfRepo
      .createQueryBuilder('s')
      .where('s.empresa_id = :empresaId', { empresaId })
      .andWhere('s.activo = true')
      .orderBy('s.created_at', 'ASC')
      .getOne();
    if (paso15) {
      pasos.push({
        paso: 15,
        nombre: 'Secuencias NCF configuradas',
        completado: true,
        completado_en: paso15.created_at.toISOString(),
      });
    } else {
      pasos.push({
        paso: 15,
        nombre: 'Secuencias NCF configuradas',
        completado: false,
        requisito: 'Configure al menos una secuencia NCF activa',
      });
    }

    const completados = pasos.filter((p) => p.completado).length;
    const porcentaje = Math.round((completados / 15) * 100);

    return {
      modo: 'integrador',
      progreso: completados,
      total: 15,
      porcentaje,
      pasos,
    };
  }

  /**
   * Helper para construir un paso integrador a partir de una factura encontrada.
   */
  private buildPasoIntegrador(
    paso: number,
    nombre: string,
    factura: FacturaElectronica | null,
    requisito: string,
  ): PasoIntegrador {
    if (factura) {
      return {
        paso,
        nombre,
        completado: true,
        factura_id: factura.id,
        e_ncf: factura.e_ncf ?? undefined,
        completado_en: factura.created_at.toISOString(),
      };
    }
    return {
      paso,
      nombre,
      completado: false,
      requisito,
    };
  }

  private async ejecutarPaso(
    paso: { paso: number; nombre: string; tipo: string },
    user: RequestContext,
    refs: {
      eNcfPaso1: string | null;
      trackIdPaso1: string | null;
      facturaIdPaso1: string | null;
      facturaIdPaso4: string | null;
      estadoPaso4: string | null;
    },
  ): Promise<PasoCertificacionResult> {
    const correlationId = `cert-paso-${paso.paso}-${Date.now()}`;

    switch (paso.tipo) {
      case 'E31':
        return this.ejecutarPasoFactura(paso, user, correlationId);
      case 'E32':
        return this.ejecutarPasoFactura(paso, user, correlationId);
      case 'E33':
        return this.ejecutarPasoNotaDebito(paso, user, correlationId, refs.eNcfPaso1);
      case 'E34':
        return this.ejecutarPasoNotaCredito(paso, user, correlationId, refs.eNcfPaso1);
      case 'E41':
      case 'E43':
      case 'E44':
      case 'E45':
        return this.ejecutarPasoFactura(paso, user, correlationId);
      case 'anulacion':
        return this.ejecutarPasoAnulacion(paso, user, refs.facturaIdPaso4, refs.estadoPaso4);
      case 'consulta_estado':
        return this.ejecutarPasoConsultaEstado(paso, user, refs.facturaIdPaso1);
      case 'aprobacion':
        return this.ejecutarPasoAprobacion(paso, user);
      case 'consulta_rangos':
        return this.ejecutarPasoConsultaRangos(paso, user);
      default:
        return {
          paso: paso.paso,
          nombre: paso.nombre,
          estado: 'fallido',
          error: `Tipo de paso no reconocido: ${paso.tipo}`,
        };
    }
  }

  /**
   * Ejecuta un paso de factura genérica (E31, E32, E41, E43, E44, E45).
   */
  private async ejecutarPasoFactura(
    paso: { paso: number; nombre: string; tipo: string },
    user: RequestContext,
    correlationId: string,
  ): Promise<PasoCertificacionResult> {
    try {
      const dto = this.buildFacturaDto(paso);
      const resultado = await this.facturasService.crearFactura(dto, user, correlationId);

      return {
        paso: paso.paso,
        nombre: paso.nombre,
        estado: 'exitoso',
        mensaje: `Factura creada exitosamente. ID: ${resultado.id}`,
        e_ncf: resultado.e_ncf ?? undefined,
        track_id: resultado.track_id,
      };
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Error desconocido';
      return {
        paso: paso.paso,
        nombre: paso.nombre,
        estado: 'fallido',
        error: msg,
      };
    }
  }

  /**
   * Paso 6: Nota de Débito (E33) - requiere referencia al e-NCF del paso 1.
   */
  private async ejecutarPasoNotaDebito(
    paso: { paso: number; nombre: string; tipo: string },
    user: RequestContext,
    correlationId: string,
    eNcfReferencia: string | null,
  ): Promise<PasoCertificacionResult> {
    if (!eNcfReferencia) {
      return {
        paso: paso.paso,
        nombre: paso.nombre,
        estado: 'omitido',
        mensaje: 'No se puede emitir Nota de Débito sin e-NCF de referencia (paso 1 falló)',
      };
    }

    try {
      const dto = {
        rnc_receptor: RNC_RECEPTOR_PRUEBA,
        nombre_receptor: 'Empresa de Prueba Certificación',
        tipo_comprobante: 'E33' as const,
        items: [
          {
            descripcion: 'Ajuste por diferencia de precio - Certificación DGII',
            cantidad: 1,
            precio_unitario: 500.0,
            tasa_itbis: 18,
          },
        ],
        informacion_referencia: {
          ncf_modificado: eNcfReferencia,
          fecha_ncf_modificado: new Date().toISOString().split('T')[0],
          codigo_modificacion: 1,
        },
      };

      const resultado = await this.facturasService.crearFactura(dto as any, user, correlationId);

      return {
        paso: paso.paso,
        nombre: paso.nombre,
        estado: 'exitoso',
        mensaje: `Nota de Débito emitida. ID: ${resultado.id}. Referencia: ${eNcfReferencia}`,
        e_ncf: resultado.e_ncf ?? undefined,
        track_id: resultado.track_id,
      };
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Error desconocido';
      return {
        paso: paso.paso,
        nombre: paso.nombre,
        estado: 'fallido',
        error: msg,
      };
    }
  }

  /**
   * Paso 7: Nota de Crédito (E34) - requiere referencia al e-NCF del paso 1.
   */
  private async ejecutarPasoNotaCredito(
    paso: { paso: number; nombre: string; tipo: string },
    user: RequestContext,
    correlationId: string,
    eNcfReferencia: string | null,
  ): Promise<PasoCertificacionResult> {
    if (!eNcfReferencia) {
      return {
        paso: paso.paso,
        nombre: paso.nombre,
        estado: 'omitido',
        mensaje: 'No se puede emitir Nota de Crédito sin e-NCF de referencia (paso 1 falló)',
      };
    }

    try {
      const dto = {
        rnc_receptor: RNC_RECEPTOR_PRUEBA,
        nombre_receptor: 'Empresa de Prueba Certificación',
        tipo_comprobante: 'E34' as const,
        items: [
          {
            descripcion: 'Devolución parcial de mercancía - Certificación DGII',
            cantidad: 1,
            precio_unitario: 300.0,
            tasa_itbis: 18,
          },
        ],
        informacion_referencia: {
          ncf_modificado: eNcfReferencia,
          fecha_ncf_modificado: new Date().toISOString().split('T')[0],
          codigo_modificacion: 2,
        },
      };

      const resultado = await this.facturasService.crearFactura(dto as any, user, correlationId);

      return {
        paso: paso.paso,
        nombre: paso.nombre,
        estado: 'exitoso',
        mensaje: `Nota de Crédito emitida. ID: ${resultado.id}. Referencia: ${eNcfReferencia}`,
        e_ncf: resultado.e_ncf ?? undefined,
        track_id: resultado.track_id,
      };
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Error desconocido';
      return {
        paso: paso.paso,
        nombre: paso.nombre,
        estado: 'fallido',
        error: msg,
      };
    }
  }

  /**
   * Paso 12: Anulación del e-CF del paso 4 (si fue aprobado).
   */
  private async ejecutarPasoAnulacion(
    paso: { paso: number; nombre: string; tipo: string },
    user: RequestContext,
    facturaIdPaso4: string | null,
    estadoPaso4: string | null,
  ): Promise<PasoCertificacionResult> {
    if (!facturaIdPaso4 || estadoPaso4 !== 'exitoso') {
      return {
        paso: paso.paso,
        nombre: paso.nombre,
        estado: 'omitido',
        mensaje: 'Paso omitido: la factura del paso 4 no fue creada exitosamente o no fue aprobada por la DGII',
      };
    }

    try {
      // Check if factura was approved (DGII must approve before we can annul)
      const factura = await this.facturasService.obtenerFactura(facturaIdPaso4, user.empresa_id);
      if (factura.estado_dgii !== 'aprobado') {
        return {
          paso: paso.paso,
          nombre: paso.nombre,
          estado: 'omitido',
          mensaje: `Paso omitido: la factura del paso 4 tiene estado "${factura.estado_dgii}" (necesita "aprobado" para anular)`,
        };
      }

      // Call the anulación directly on the service
      await this.facturasService.actualizarEstadoAnulado(facturaIdPaso4);

      return {
        paso: paso.paso,
        nombre: paso.nombre,
        estado: 'exitoso',
        mensaje: `Factura ${facturaIdPaso4} marcada como anulada`,
      };
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Error desconocido';
      return {
        paso: paso.paso,
        nombre: paso.nombre,
        estado: 'fallido',
        error: msg,
      };
    }
  }

  /**
   * Paso 13: Consulta de estado por Track ID de la factura del paso 1.
   */
  private async ejecutarPasoConsultaEstado(
    paso: { paso: number; nombre: string; tipo: string },
    user: RequestContext,
    facturaIdPaso1: string | null,
  ): Promise<PasoCertificacionResult> {
    if (!facturaIdPaso1) {
      return {
        paso: paso.paso,
        nombre: paso.nombre,
        estado: 'omitido',
        mensaje: 'Paso omitido: no hay factura del paso 1 para consultar estado',
      };
    }

    try {
      const estado = await this.facturasService.obtenerEstadoFactura(
        facturaIdPaso1,
        user.empresa_id,
      );

      return {
        paso: paso.paso,
        nombre: paso.nombre,
        estado: 'exitoso',
        mensaje: `Estado consultado: ${estado.estado_dgii}`,
        e_ncf: estado.e_ncf ?? undefined,
        track_id: estado.track_id,
      };
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Error desconocido';
      return {
        paso: paso.paso,
        nombre: paso.nombre,
        estado: 'fallido',
        error: msg,
      };
    }
  }

  /**
   * Paso 14: Registrar y aprobar una factura recibida (Aprobación Comercial).
   */
  private async ejecutarPasoAprobacion(
    paso: { paso: number; nombre: string; tipo: string },
    user: RequestContext,
  ): Promise<PasoCertificacionResult> {
    try {
      // Register a fake received invoice
      const facturaRecibida = await this.facturasRecibidasService.registrar(
        {
          rnc_emisor: RNC_RECEPTOR_PRUEBA,
          nombre_emisor: 'Proveedor de Prueba Certificación DGII',
          e_ncf: `E310000000${Date.now().toString().slice(-4)}`,
          fecha_emision: new Date().toISOString().split('T')[0],
          monto_total: 5900.0,
        },
        user.empresa_id,
      );

      // Approve it
      const aprobada = await this.facturasRecibidasService.aprobar(
        facturaRecibida.id,
        user.empresa_id,
      );

      return {
        paso: paso.paso,
        nombre: paso.nombre,
        estado: 'exitoso',
        mensaje: `Factura recibida registrada y aprobada. Track: ${aprobada.track_id_aprobacion}`,
        track_id: aprobada.track_id_aprobacion ?? null,
      };
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Error desconocido';
      return {
        paso: paso.paso,
        nombre: paso.nombre,
        estado: 'fallido',
        error: msg,
      };
    }
  }

  /**
   * Paso 15: Consulta de rangos NCF disponibles.
   */
  private async ejecutarPasoConsultaRangos(
    paso: { paso: number; nombre: string; tipo: string },
    user: RequestContext,
  ): Promise<PasoCertificacionResult> {
    try {
      const estado = await this.secuenciasNcfService.getEstado(user.empresa_id);

      const totalRestantes = estado.reduce((sum, s) => sum + s.restantes, 0);

      return {
        paso: paso.paso,
        nombre: paso.nombre,
        estado: 'exitoso',
        mensaje: `${estado.length} secuencia(s) activa(s). Total restante: ${totalRestantes} NCFs`,
      };
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Error desconocido';
      return {
        paso: paso.paso,
        nombre: paso.nombre,
        estado: 'fallido',
        error: msg,
      };
    }
  }

  /**
   * Construye el DTO de factura según el paso y tipo de comprobante.
   */
  private buildFacturaDto(paso: { paso: number; nombre: string; tipo: string }): any {
    switch (paso.paso) {
      case 1:
        // E31 básica - un solo ítem
        return {
          rnc_receptor: RNC_RECEPTOR_PRUEBA,
          nombre_receptor: 'Empresa de Prueba Certificación',
          tipo_comprobante: 'E31',
          items: [
            {
              descripcion: 'Servicio de consultoría tecnológica - Certificación DGII Paso 1',
              cantidad: 1,
              precio_unitario: 5000.0,
              tasa_itbis: 18,
            },
          ],
        };

      case 2:
        // E31 múltiples ítems
        return {
          rnc_receptor: RNC_RECEPTOR_PRUEBA,
          nombre_receptor: 'Empresa de Prueba Certificación',
          tipo_comprobante: 'E31',
          items: [
            {
              descripcion: 'Licencia de software anual - Certificación DGII Paso 2',
              cantidad: 2,
              precio_unitario: 1500.0,
              tasa_itbis: 18,
            },
            {
              descripcion: 'Soporte técnico mensual - Certificación DGII Paso 2',
              cantidad: 3,
              precio_unitario: 800.0,
              tasa_itbis: 18,
            },
            {
              descripcion: 'Capacitación presencial - Certificación DGII Paso 2',
              cantidad: 1,
              precio_unitario: 2500.0,
              tasa_itbis: 18,
            },
          ],
        };

      case 3:
        // E31 con descuento
        return {
          rnc_receptor: RNC_RECEPTOR_PRUEBA,
          nombre_receptor: 'Empresa de Prueba Certificación',
          tipo_comprobante: 'E31',
          descuento_global: 10,
          items: [
            {
              descripcion: 'Equipos de computación - Certificación DGII Paso 3',
              cantidad: 5,
              precio_unitario: 3000.0,
              tasa_itbis: 18,
            },
          ],
        };

      case 4:
        // E32 Factura de Consumo
        return {
          rnc_receptor: RNC_RECEPTOR_PRUEBA,
          nombre_receptor: 'Consumidor Final',
          tipo_comprobante: 'E32',
          items: [
            {
              descripcion: 'Venta al detalle de productos - Certificación DGII Paso 4',
              cantidad: 2,
              precio_unitario: 750.0,
              tasa_itbis: 18,
            },
          ],
        };

      case 5:
        // E32 con ITBIS explícito
        return {
          rnc_receptor: RNC_RECEPTOR_PRUEBA,
          nombre_receptor: 'Consumidor Final',
          tipo_comprobante: 'E32',
          items: [
            {
              descripcion: 'Producto A - ITBIS 18% - Certificación DGII Paso 5',
              cantidad: 3,
              precio_unitario: 1200.0,
              tasa_itbis: 18,
            },
            {
              descripcion: 'Producto B - Exento - Certificación DGII Paso 5',
              cantidad: 1,
              precio_unitario: 500.0,
              tasa_itbis: 0,
            },
          ],
        };

      case 8:
        // E41 Comprobante de Compras
        return {
          rnc_receptor: RNC_RECEPTOR_PRUEBA,
          nombre_receptor: 'Proveedor Informal de Prueba',
          tipo_comprobante: 'E41',
          items: [
            {
              descripcion: 'Compra de materia prima - Certificación DGII Paso 8',
              cantidad: 10,
              precio_unitario: 250.0,
              tasa_itbis: 18,
            },
          ],
        };

      case 9:
        // E43 Gastos Menores
        return {
          rnc_receptor: RNC_RECEPTOR_PRUEBA,
          nombre_receptor: 'Gasto Menor de Prueba',
          tipo_comprobante: 'E43',
          items: [
            {
              descripcion: 'Material de oficina - Certificación DGII Paso 9',
              cantidad: 1,
              precio_unitario: 350.0,
              tasa_itbis: 18,
            },
          ],
        };

      case 10:
        // E44 Regímenes Especiales
        return {
          rnc_receptor: RNC_RECEPTOR_PRUEBA,
          nombre_receptor: 'Empresa Zona Franca de Prueba',
          tipo_comprobante: 'E44',
          items: [
            {
              descripcion: 'Servicio a zona franca - Certificación DGII Paso 10',
              cantidad: 1,
              precio_unitario: 8000.0,
              tasa_itbis: 0,
            },
          ],
        };

      case 11:
        // E45 Gubernamental
        return {
          rnc_receptor: RNC_RECEPTOR_PRUEBA,
          nombre_receptor: 'Institución Gubernamental de Prueba',
          tipo_comprobante: 'E45',
          items: [
            {
              descripcion: 'Servicio al gobierno - Certificación DGII Paso 11',
              cantidad: 1,
              precio_unitario: 12000.0,
              tasa_itbis: 18,
            },
          ],
        };

      default:
        return {
          rnc_receptor: RNC_RECEPTOR_PRUEBA,
          nombre_receptor: 'Empresa de Prueba',
          tipo_comprobante: paso.tipo,
          items: [
            {
              descripcion: `Prueba genérica - Certificación DGII Paso ${paso.paso}`,
              cantidad: 1,
              precio_unitario: 1000.0,
              tasa_itbis: 18,
            },
          ],
        };
    }
  }
}
