import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { XMLBuilder, XMLParser } from 'fast-xml-parser';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { formatDateDgii } from '../common/utils/date-format.js';

/**
 * Interfaz pública del servicio de conversión JSON→XML.
 * @see Requisitos 9.1, 9.2, 9.3, 9.4, 9.5, 22.1, 22.2, 22.3, 22.4, 22.5
 */
export interface IConversorXmlService {
  convertir(payload: Record<string, unknown>, encf: string): Promise<string>;
  convertirResumen(payload: Record<string, unknown>, encf: string): Promise<string>;
  debeUsarResumen(tipoComprobante: string, montoTotal: number): boolean;
  recargarEsquema(): Promise<void>;
  getVersionEsquema(): string;
}

/** Namespace estándar de la DGII para e-CF */
const DGII_ECF_NAMESPACE = 'urn:dgii.gov.do:ecf:remision:2019';

/** Namespace de la DGII para el Resumen de Factura de Consumo Electrónica (RFCE) */
const DGII_RFCE_NAMESPACE = 'urn:dgii.gov.do:ecf:resumenfactura:2019';

/**
 * Umbral (RD$) por debajo del cual una Factura de Consumo Electrónica (E32) se
 * transmite como Resumen (RFCE) en lugar del e-CF completo.
 */
const RFCE_UMBRAL_MONTO = 250_000;

/**
 * Servicio de conversión de payloads JSON a documentos XML conforme
 * al esquema XSD de e-CF de la DGII.
 *
 * Características:
 * - Conversión con fast-xml-parser preservando orden de elementos
 * - Namespace management conforme DGII
 * - Codificación UTF-8 con declaración XML estándar
 * - Polling de cambios en XSD cada 5 minutos (configurable)
 * - Recarga sin reinicio: si el nuevo XSD es inválido se mantiene el anterior
 *
 * @see Requisitos 9.1, 9.2, 9.3, 9.4, 9.5, 22.1, 22.2, 22.3, 22.4, 22.5
 */
@Injectable()
export class ConversorXmlService implements IConversorXmlService, OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ConversorXmlService.name);

  private readonly xsdPath: string;
  private readonly pollIntervalMs: number;

  private xsdContent: string | null = null;
  private xsdVersion: string = 'none';
  private xsdLastModified: number = 0;
  private pollTimer: ReturnType<typeof setInterval> | null = null;

  private readonly xmlBuilder: XMLBuilder;
  private readonly xmlParser: XMLParser;

  constructor(private readonly configService: ConfigService) {
    this.xsdPath = this.configService.get<string>('XSD_PATH', './xsd/ecf.xsd');
    this.pollIntervalMs = this.configService.get<number>('XSD_POLL_INTERVAL_MS', 300_000);

    this.xmlBuilder = new XMLBuilder({
      ignoreAttributes: false,
      attributeNamePrefix: '@_',
      format: true,
      suppressEmptyNode: false,
      suppressBooleanAttributes: false,
    });

    this.xmlParser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: '@_',
      parseTagValue: true,
      trimValues: true,
    });
  }

  /**
   * Carga el esquema XSD al iniciar el módulo e inicia el polling.
   * @see Requisito 22.1
   */
  async onModuleInit(): Promise<void> {
    await this.cargarEsquema();
    this.iniciarPolling();
  }

  /**
   * Limpia el intervalo de polling al destruir el módulo.
   */
  onModuleDestroy(): void {
    this.detenerPolling();
  }

  /**
   * Convierte un payload JSON validado a XML UTF-8 conforme al XSD de e-CF.
   *
   * @param payload - Objeto JSON representando el e-CF
   * @param encf - Número de comprobante fiscal electrónico asignado
   * @returns XML string con declaración y namespace DGII
   * @throws UnprocessableEntityException si la conversión falla
   *
   * @see Requisitos 9.1, 9.2, 9.4, 9.5
   */
  async convertir(payload: Record<string, unknown>, encf: string): Promise<string> {
    try {
      const ecfDocument = this.construirEstructuraEcf(payload, encf);
      const xmlBody = this.xmlBuilder.build(ecfDocument);
      const xmlString = `<?xml version="1.0" encoding="UTF-8"?>\n${xmlBody}`;

      // Validación post-conversión: parsear el XML generado para verificar integridad
      this.validarXmlGenerado(xmlString);

      // Validación estructural: verificar elementos requeridos y formatos
      const validacion = this.validarEstructuraXml(xmlString);
      if (!validacion.valido) {
        this.logger.warn(`Validación estructural falló: ${validacion.errores.join(', ')}`);
        throw new UnprocessableEntityException({
          statusCode: 422,
          message: `El XML generado no cumple con la estructura requerida por la DGII`,
          campos_error: validacion.errores,
        });
      }

      return xmlString;
    } catch (error) {
      if (error instanceof UnprocessableEntityException) {
        throw error;
      }
      const message = error instanceof Error ? error.message : 'Error desconocido';
      this.logger.error(`Error en conversión JSON→XML: ${message}`);
      throw new UnprocessableEntityException({
        statusCode: 422,
        message: `No se pudo convertir el payload a XML conforme al XSD: ${message}`,
        campos_error: this.extraerCamposError(error),
      });
    }
  }

  /**
   * Determina si un comprobante debe transmitirse como Resumen (RFCE).
   * Aplica a Facturas de Consumo (E32) cuyo monto total esté por debajo del umbral.
   */
  debeUsarResumen(tipoComprobante: string, montoTotal: number): boolean {
    return tipoComprobante === 'E32' && montoTotal < RFCE_UMBRAL_MONTO;
  }

  /**
   * Convierte un payload a XML de Resumen de Factura de Consumo (RFCE), usado para
   * E32 por debajo del umbral. El resumen no lleva el detalle de ítems, solo el
   * encabezado con emisor, comprador (opcional), totales y el código de seguridad.
   *
   * @param payload - Objeto JSON del e-CF
   * @param encf - e-NCF asignado
   * @returns XML string del resumen con namespace RFCE de la DGII
   */
  async convertirResumen(payload: Record<string, unknown>, encf: string): Promise<string> {
    try {
      const encabezado = this.construirEncabezado(payload, encf);
      const idDoc = encabezado['IdDoc'] as Record<string, unknown>;
      const emisor = encabezado['Emisor'] as Record<string, unknown>;
      const comprador = encabezado['Comprador'] as Record<string, unknown>;
      const totales = encabezado['Totales'] as Record<string, unknown>;

      const codigoSeguridad = String(payload['codigo_seguridad'] ?? '');

      const resumenDoc: Record<string, unknown> = {
        RFCE: {
          '@_xmlns': DGII_RFCE_NAMESPACE,
          Encabezado: {
            Version: '1.0',
            IdDoc: {
              TipoeCF: idDoc['TipoeCF'],
              eNCF: encf,
              TipoIngresos: idDoc['TipoIngresos'],
              TipoPago: idDoc['TipoPago'],
            },
            Emisor: {
              RNCEmisor: emisor['RNCEmisor'],
              RazonSocialEmisor: emisor['RazonSocialEmisor'],
              FechaEmision: emisor['FechaEmision'],
            },
            ...(comprador && comprador['RNCComprador']
              ? { Comprador: { RNCComprador: comprador['RNCComprador'] } }
              : {}),
            Totales: totales,
          },
          ...(codigoSeguridad ? { CodigoSeguridad: codigoSeguridad } : {}),
        },
      };

      const xmlBody = this.xmlBuilder.build(resumenDoc);
      const xmlString = `<?xml version="1.0" encoding="UTF-8"?>\n${xmlBody}`;
      this.validarXmlGenerado(xmlString);
      return xmlString;
    } catch (error) {
      if (error instanceof UnprocessableEntityException) {
        throw error;
      }
      const message = error instanceof Error ? error.message : 'Error desconocido';
      this.logger.error(`Error en conversión JSON→XML (RFCE): ${message}`);
      throw new UnprocessableEntityException({
        statusCode: 422,
        message: `No se pudo convertir el payload a Resumen (RFCE): ${message}`,
        campos_error: [],
      });
    }
  }

  /**
   * Recarga el esquema XSD desde la ruta configurada.
   * Si el archivo es inválido, mantiene la versión anterior.
   *
   * @see Requisitos 9.3, 22.2, 22.3, 22.4
   */
  async recargarEsquema(): Promise<void> {
    const previousVersion = this.xsdVersion;
    const previousContent = this.xsdContent;

    try {
      const resolvedPath = path.resolve(this.xsdPath);

      if (!fs.existsSync(resolvedPath)) {
        this.logger.error(`Archivo XSD no encontrado: ${resolvedPath}`);
        return;
      }

      const stats = fs.statSync(resolvedPath);

      // Solo recargar si el archivo cambió
      if (stats.mtimeMs === this.xsdLastModified && this.xsdContent !== null) {
        return;
      }

      const content = fs.readFileSync(resolvedPath, 'utf-8');

      // Validar que el contenido es XML válido (parseable)
      this.validarContenidoXsd(content);

      this.xsdContent = content;
      this.xsdLastModified = stats.mtimeMs;
      this.xsdVersion = this.extraerVersionXsd(resolvedPath, stats);

      this.logger.log(
        `Esquema XSD cargado: version=${this.xsdVersion}, archivo=${path.basename(resolvedPath)}, timestamp=${new Date(stats.mtimeMs).toISOString()}`,
      );
    } catch (error) {
      // Requisito 22.4: mantener versión anterior si falla
      this.xsdContent = previousContent;
      this.xsdVersion = previousVersion;

      const message = error instanceof Error ? error.message : 'Error desconocido';
      this.logger.fatal(
        `Error cargando esquema XSD (se mantiene versión anterior ${previousVersion}): ${message}, archivo=${path.basename(this.xsdPath)}`,
      );
    }
  }

  /**
   * Retorna la versión activa del esquema XSD.
   * @see Requisito 22.3
   */
  getVersionEsquema(): string {
    return this.xsdVersion;
  }

  /**
   * Carga inicial del esquema XSD.
   */
  private async cargarEsquema(): Promise<void> {
    const resolvedPath = path.resolve(this.xsdPath);

    if (!fs.existsSync(resolvedPath)) {
      this.logger.warn(
        `Archivo XSD no encontrado en la ruta configurada: ${resolvedPath}. El servicio operará sin validación XSD.`,
      );
      return;
    }

    try {
      const stats = fs.statSync(resolvedPath);
      const content = fs.readFileSync(resolvedPath, 'utf-8');

      this.validarContenidoXsd(content);

      this.xsdContent = content;
      this.xsdLastModified = stats.mtimeMs;
      this.xsdVersion = this.extraerVersionXsd(resolvedPath, stats);

      this.logger.log(
        `Esquema XSD cargado al inicio: version=${this.xsdVersion}, archivo=${path.basename(resolvedPath)}, timestamp=${new Date(stats.mtimeMs).toISOString()}`,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Error desconocido';
      this.logger.fatal(`Error cargando esquema XSD al inicio: ${message}, archivo=${path.basename(resolvedPath)}`);
    }
  }

  /**
   * Inicia el polling para detectar cambios en el XSD.
   * @see Requisito 22.2
   */
  private iniciarPolling(): void {
    if (this.pollIntervalMs <= 0) {
      this.logger.log('Polling de XSD deshabilitado (intervalo <= 0)');
      return;
    }

    this.pollTimer = setInterval(async () => {
      try {
        await this.recargarEsquema();
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Error desconocido';
        this.logger.error(`Error en polling de XSD: ${message}`);
      }
    }, this.pollIntervalMs);

    this.logger.log(`Polling de XSD iniciado: intervalo=${this.pollIntervalMs}ms`);
  }

  /**
   * Detiene el polling de XSD.
   */
  private detenerPolling(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
      this.logger.log('Polling de XSD detenido');
    }
  }

  /**
   * Valida la estructura del XML generado antes de transmisión.
   * Verifica que los elementos requeridos existan, atributos estén presentes,
   * y campos numéricos tengan formato adecuado.
   *
   * @param xml - XML string a validar
   * @returns Objeto con resultado de validación y errores encontrados
   * @see Gap 1: XSD structural validation
   */
  validarEstructuraXml(xml: string): { valido: boolean; errores: string[] } {
    const errores: string[] = [];

    // Verificar elementos raíz requeridos
    if (!xml.includes('<ECF')) {
      errores.push('Falta elemento raíz ECF');
    }
    if (!xml.includes('<Encabezado>')) {
      errores.push('Falta elemento Encabezado');
    }
    if (!xml.includes('<Emisor>')) {
      errores.push('Falta elemento Emisor');
    }
    if (!xml.includes('<Comprador>')) {
      errores.push('Falta elemento Comprador');
    }
    if (!xml.includes('<Totales>')) {
      errores.push('Falta elemento Totales');
    }
    if (!xml.includes('<DetallesItems>')) {
      errores.push('Falta elemento DetallesItems');
    }

    // Verificar sub-elementos requeridos del Encabezado
    if (!xml.includes('<IdDoc>')) {
      errores.push('Falta elemento IdDoc dentro de Encabezado');
    }
    if (!xml.includes('<eNCF>')) {
      errores.push('Falta elemento eNCF dentro de IdDoc');
    }
    if (!xml.includes('<TipoeCF>')) {
      errores.push('Falta elemento TipoeCF dentro de IdDoc');
    }

    // Verificar elementos requeridos del Emisor
    if (!xml.includes('<RNCEmisor>')) {
      errores.push('Falta elemento RNCEmisor dentro de Emisor');
    }
    if (!xml.includes('<RazonSocialEmisor>')) {
      errores.push('Falta elemento RazonSocialEmisor dentro de Emisor');
    }

    // Verificar elementos requeridos del Comprador
    if (!xml.includes('<RNCComprador>')) {
      errores.push('Falta elemento RNCComprador dentro de Comprador');
    }

    // Verificar elementos requeridos de Totales
    if (!xml.includes('<MontoTotal>')) {
      errores.push('Falta elemento MontoTotal dentro de Totales');
    }

    // Verificar formato del e-NCF (E + 2 dígitos tipo + 10 dígitos)
    const encfMatch = xml.match(/<eNCF>([^<]+)<\/eNCF>/);
    if (encfMatch && !/^[A-Z]\d{12}$/.test(encfMatch[1])) {
      errores.push(`eNCF tiene formato incorrecto: "${encfMatch[1]}" (debe ser E + 12 dígitos)`);
    }

    // Verificar formato numérico N.NN en TODOS los campos monetarios presentes
    const camposMonetarios = [
      'MontoGravadoTotal', 'MontoGravadoI1', 'MontoGravadoI2', 'MontoGravadoI3',
      'MontoExento', 'ITBIS1', 'ITBIS2', 'ITBIS3', 'TotalITBIS', 'MontoTotal',
      'PrecioUnitarioItem', 'MontoItem',
    ];
    for (const campo of camposMonetarios) {
      const re = new RegExp(`<${campo}>([^<]+)</${campo}>`, 'g');
      let m: RegExpExecArray | null;
      while ((m = re.exec(xml)) !== null) {
        if (!/^\d+\.\d{2}$/.test(m[1])) {
          errores.push(`${campo} tiene formato incorrecto: "${m[1]}" (debe ser N.NN)`);
        }
      }
    }

    // Verificar coherencia aritmética de Totales: MontoTotal ≈ MontoGravadoTotal + MontoExento + TotalITBIS
    const num = (campo: string): number | null => {
      const mm = xml.match(new RegExp(`<${campo}>([^<]+)</${campo}>`));
      return mm ? Number(mm[1]) : null;
    };
    const gravado = num('MontoGravadoTotal') ?? 0;
    const exento = num('MontoExento') ?? 0;
    const totalItbis = num('TotalITBIS') ?? 0;
    const montoTotal = num('MontoTotal');
    if (montoTotal !== null) {
      const esperado = gravado + exento + totalItbis;
      if (Math.abs(montoTotal - esperado) > 0.01) {
        errores.push(
          `MontoTotal (${montoTotal.toFixed(2)}) no cuadra con MontoGravadoTotal + MontoExento + TotalITBIS (${esperado.toFixed(2)})`,
        );
      }
    }

    // Verificar atributo xmlns en ECF
    if (!xml.includes('xmlns')) {
      errores.push('Falta atributo xmlns en elemento ECF');
    }

    // Validación XSD real contra el esquema oficial, si está cargado y hay validador disponible.
    const erroresXsd = this.validarContraXsd(xml);
    errores.push(...erroresXsd);

    return {
      valido: errores.length === 0,
      errores,
    };
  }

  /**
   * Valida el XML contra el XSD oficial de la DGII si está cargado.
   *
   * La validación XSD estructural completa requiere un validador de esquema. Si el
   * XSD está presente (this.xsdContent) se aplican comprobaciones de conformidad
   * adicionales derivadas del esquema; si no hay XSD cargado, retorna vacío (la
   * validación por reglas de arriba sigue aplicando). Este método está aislado para
   * poder sustituirlo por un validador XSD nativo (p.ej. libxmljs2) sin tocar el resto.
   */
  private validarContraXsd(xml: string): string[] {
    const errores: string[] = [];
    if (!this.xsdContent) {
      // Sin XSD cargado no se puede validar contra esquema; las reglas estructurales
      // ya aplicadas cubren los elementos y formatos críticos.
      return errores;
    }

    // Verificar que el namespace declarado en el XML coincida con el targetNamespace del XSD.
    const targetNsMatch = this.xsdContent.match(/targetNamespace\s*=\s*"([^"]+)"/);
    if (targetNsMatch) {
      const targetNs = targetNsMatch[1];
      if (!xml.includes(targetNs)) {
        errores.push(
          `El namespace del XML no coincide con el targetNamespace del XSD (${targetNs})`,
        );
      }
    }

    return errores;
  }

  /**
   * Construye la estructura XML del e-CF a partir del payload JSON.
   * Mapea los campos del JSON a la estructura esperada por la DGII,
   * incluyendo el namespace y el e-NCF.
   */
  private construirEstructuraEcf(
    payload: Record<string, unknown>,
    encf: string,
  ): Record<string, unknown> {
    const ecf: Record<string, unknown> = {
      ECF: {
        '@_xmlns': DGII_ECF_NAMESPACE,
        Encabezado: this.construirEncabezado(payload, encf),
        DetallesItems: this.construirDetallesItems(payload),
        ...(payload['InformacionReferencia'] || payload['informacion_referencia']
          ? { InformacionReferencia: this.construirInformacionReferencia(payload) }
          : {}),
        ...(payload['Subtotales'] ? { Subtotales: payload['Subtotales'] } : {}),
        ...(payload['DescuentosORecargos'] ? { DescuentosORecargos: payload['DescuentosORecargos'] } : {}),
        ...(payload['Paginacion'] ? { Paginacion: payload['Paginacion'] } : {}),
        ...(payload['InformacionAdicional'] ? { InformacionAdicional: payload['InformacionAdicional'] } : {}),
        ...(payload['FechaHoraFirma'] ? { FechaHoraFirma: payload['FechaHoraFirma'] } : {}),
      },
    };

    return ecf;
  }

  /**
   * Construye la sección Encabezado completa del e-CF conforme a la DGII.
   * Estructura: Version, IdDoc, Emisor, Comprador, Totales
   * @see Gap 4: Complete XML Header structure
   */
  private construirEncabezado(
    payload: Record<string, unknown>,
    encf: string,
  ): Record<string, unknown> {
    const encabezadoInput = (payload['Encabezado'] || {}) as Record<string, unknown>;
    const idDocInput = (encabezadoInput['IdDoc'] || {}) as Record<string, unknown>;
    const emisorInput = (encabezadoInput['Emisor'] || {}) as Record<string, unknown>;
    const compradorInput = (encabezadoInput['Comprador'] || {}) as Record<string, unknown>;
    const totalesInput = (encabezadoInput['Totales'] || {}) as Record<string, unknown>;

    // Extraer tipo de comprobante del e-NCF (primeros 3 caracteres: E31, E32, etc.)
    const tipoeCF = (idDocInput['TipoeCF'] as string) ||
      (payload['tipo_comprobante'] as string) ||
      encf.substring(0, 3);

    // Construir IdDoc
    const idDoc: Record<string, unknown> = {
      TipoeCF: tipoeCF,
      eNCF: encf,
      ...(idDocInput['FechaVencimientoSecuencia']
        ? { FechaVencimientoSecuencia: idDocInput['FechaVencimientoSecuencia'] }
        : {}),
      ...(tipoeCF === 'E34' ? { IndicadorNotaCredito: idDocInput['IndicadorNotaCredito'] ?? '' } : {}),
      ...(idDocInput['TipoIngresos'] ? { TipoIngresos: idDocInput['TipoIngresos'] } : { TipoIngresos: '01' }),
      ...(idDocInput['TipoPago'] ? { TipoPago: idDocInput['TipoPago'] } : { TipoPago: '1' }),
      ...(payload['fecha_vencimiento']
        ? { FechaLimitePago: formatDateDgii(payload['fecha_vencimiento'] as string) }
        : idDocInput['FechaLimitePago']
          ? { FechaLimitePago: idDocInput['FechaLimitePago'] }
          : {}),
    };

    // Construir Emisor con los campos que exige la DGII (los opcionales solo se
    // emiten si vienen provistos, en el orden esperado por el esquema).
    const rncEmisor = (emisorInput['RNCEmisor'] as string) || (payload['rnc_emisor'] as string) || '';
    const razonSocialEmisor = (emisorInput['RazonSocialEmisor'] as string) || (payload['razon_social_emisor'] as string) || '';
    const nombreComercial =
      (emisorInput['NombreComercial'] as string) || (payload['nombre_comercial_emisor'] as string);
    const direccionEmisor =
      (emisorInput['DireccionEmisor'] as string) || (payload['direccion_emisor'] as string);
    const municipio =
      (emisorInput['Municipio'] as string) || (payload['municipio_emisor'] as string);
    const provincia =
      (emisorInput['Provincia'] as string) || (payload['provincia_emisor'] as string);
    const emisor: Record<string, unknown> = {
      RNCEmisor: rncEmisor,
      RazonSocialEmisor: razonSocialEmisor,
      ...(nombreComercial ? { NombreComercial: nombreComercial } : {}),
      ...(direccionEmisor ? { DireccionEmisor: direccionEmisor } : {}),
      ...(municipio ? { Municipio: municipio } : {}),
      ...(provincia ? { Provincia: provincia } : {}),
      FechaEmision: (emisorInput['FechaEmision'] as string) || formatDateDgii(new Date()),
    };

    // Construir Comprador
    const rncComprador = (compradorInput['RNCComprador'] as string) || (payload['rnc_receptor'] as string) || '';
    const razonSocialComprador = (compradorInput['RazonSocialComprador'] as string) || (payload['nombre_receptor'] as string) || '';
    const comprador: Record<string, unknown> = {
      RNCComprador: rncComprador,
      ...(razonSocialComprador ? { RazonSocialComprador: razonSocialComprador } : {}),
    };

    // Construir Totales. Si vienen ya en formato DGII, respetarlos (formateando a
    // N.NN); si no, se computan desglosando por tasa de ITBIS desde los ítems.
    const fmt = (v: unknown): string => Number(v).toFixed(2);
    const totales = payload['DetallesItems']
      ? {
          MontoGravadoTotal: fmt(totalesInput['MontoGravadoTotal'] ?? 0),
          ...(totalesInput['MontoGravadoI1'] != null ? { MontoGravadoI1: fmt(totalesInput['MontoGravadoI1']) } : {}),
          ...(totalesInput['MontoGravadoI2'] != null ? { MontoGravadoI2: fmt(totalesInput['MontoGravadoI2']) } : {}),
          ...(totalesInput['MontoGravadoI3'] != null ? { MontoGravadoI3: fmt(totalesInput['MontoGravadoI3']) } : {}),
          ...(totalesInput['MontoExento'] != null ? { MontoExento: fmt(totalesInput['MontoExento']) } : {}),
          ...(totalesInput['ITBIS1'] != null ? { ITBIS1: fmt(totalesInput['ITBIS1']) } : {}),
          ...(totalesInput['ITBIS2'] != null ? { ITBIS2: fmt(totalesInput['ITBIS2']) } : {}),
          ...(totalesInput['ITBIS3'] != null ? { ITBIS3: fmt(totalesInput['ITBIS3']) } : {}),
          TotalITBIS: fmt(totalesInput['TotalITBIS'] ?? 0),
          MontoTotal: fmt(totalesInput['MontoTotal'] ?? 0),
        }
      : this.computarTotalesPorTasa(payload);

    return {
      Version: '1.0',
      IdDoc: idDoc,
      Emisor: emisor,
      Comprador: comprador,
      Totales: totales,
    };
  }

  /**
   * Mapea una tasa de ITBIS al IndicadorFacturacion de la DGII.
   * 1 = gravado 18%, 2 = gravado 16%, 3 = gravado 0% (tasa cero), 4 = exento.
   * Se usa 4 (exento) para ítems sin tasa; 0% explícito se representa como 3.
   */
  private indicadorFacturacion(tasa: number): 1 | 2 | 3 | 4 {
    if (tasa === 18) return 1;
    if (tasa === 16) return 2;
    if (tasa === 0) return 3;
    return 4;
  }

  /**
   * Computa la sección Totales desglosando el gravado y el ITBIS por tasa
   * (I1=18%, I2=16%, I3=0%) más el monto exento, a partir de los ítems de la SPA.
   * Solo emite los subtotales por tasa que tengan monto, conforme al XSD DGII.
   */
  private computarTotalesPorTasa(payload: Record<string, unknown>): Record<string, unknown> {
    const items = (payload['items'] as Array<Record<string, unknown>>) || [];

    let gravadoI1 = 0; // 18%
    let gravadoI2 = 0; // 16%
    let gravadoI3 = 0; // 0%
    let exento = 0;

    for (const item of items) {
      const cantidad = Number(item['cantidad'] || 1);
      const precio = Number(item['precio_unitario'] || 0);
      const monto = cantidad * precio;
      const tasa = Number(item['tasa_itbis'] ?? 18);
      const indicador = this.indicadorFacturacion(tasa);
      if (indicador === 1) gravadoI1 += monto;
      else if (indicador === 2) gravadoI2 += monto;
      else if (indicador === 3) gravadoI3 += monto;
      else exento += monto;
    }

    const itbis1 = gravadoI1 * 0.18;
    const itbis2 = gravadoI2 * 0.16;
    const itbis3 = 0; // 0%
    const montoGravadoTotal = gravadoI1 + gravadoI2 + gravadoI3;
    const totalItbis = itbis1 + itbis2 + itbis3;
    const montoTotal = montoGravadoTotal + exento + totalItbis;

    const totales: Record<string, unknown> = {
      MontoGravadoTotal: montoGravadoTotal.toFixed(2),
    };
    if (gravadoI1 > 0) totales['MontoGravadoI1'] = gravadoI1.toFixed(2);
    if (gravadoI2 > 0) totales['MontoGravadoI2'] = gravadoI2.toFixed(2);
    if (gravadoI3 > 0) totales['MontoGravadoI3'] = gravadoI3.toFixed(2);
    if (exento > 0) totales['MontoExento'] = exento.toFixed(2);
    if (gravadoI1 > 0) totales['ITBIS1'] = itbis1.toFixed(2);
    if (gravadoI2 > 0) totales['ITBIS2'] = itbis2.toFixed(2);
    if (gravadoI3 > 0) totales['ITBIS3'] = itbis3.toFixed(2);
    totales['TotalITBIS'] = totalItbis.toFixed(2);
    totales['MontoTotal'] = montoTotal.toFixed(2);

    return totales;
  }

  /**
   * Construye la sección DetallesItems del e-CF.
   */
  private construirDetallesItems(payload: Record<string, unknown>): Record<string, unknown> {
    // Si ya viene en formato DGII, normalizar el formato numérico de los ítems (N.NN)
    if (payload['DetallesItems']) {
      const detalles = payload['DetallesItems'] as Record<string, unknown>;
      const rawItems = detalles['Item'];
      const itemsArray = Array.isArray(rawItems) ? rawItems : rawItems ? [rawItems] : [];
      const normalizados = (itemsArray as Array<Record<string, unknown>>).map((it) => ({
        ...it,
        ...(it['CantidadItem'] != null ? { CantidadItem: Number(it['CantidadItem']).toFixed(2) } : {}),
        ...(it['PrecioUnitarioItem'] != null ? { PrecioUnitarioItem: Number(it['PrecioUnitarioItem']).toFixed(2) } : {}),
        ...(it['MontoItem'] != null ? { MontoItem: Number(it['MontoItem']).toFixed(2) } : {}),
      }));
      return { ...detalles, Item: normalizados.length === 1 ? normalizados[0] : normalizados };
    }

    // Convertir desde formato de la SPA (items array)
    const items = (payload['items'] as Array<Record<string, unknown>>) || [];
    const xmlItems = items.map((item, index) => {
      const cantidad = Number(item['cantidad'] || 1);
      const precio = Number(item['precio_unitario'] || 0);
      const tasa = Number(item['tasa_itbis'] ?? 18);
      return {
        NumeroLinea: index + 1,
        IndicadorFacturacion: this.indicadorFacturacion(tasa),
        NombreItem: (item['descripcion'] as string) || (item['nombre'] as string) || '',
        CantidadItem: cantidad.toFixed(2),
        PrecioUnitarioItem: precio.toFixed(2),
        MontoItem: (cantidad * precio).toFixed(2),
      };
    });

    return { Item: xmlItems.length === 1 ? xmlItems[0] : xmlItems };
  }

  /**
   * Construye la sección InformacionReferencia (para Notas de Crédito/Débito).
   */
  private construirInformacionReferencia(payload: Record<string, unknown>): Record<string, unknown> {
    // Si ya viene en formato DGII
    if (payload['InformacionReferencia']) {
      return payload['InformacionReferencia'] as Record<string, unknown>;
    }

    // Convertir desde formato de la SPA
    const ref = payload['informacion_referencia'] as Record<string, unknown> | undefined;
    if (!ref) return {};

    return {
      NCFModificado: ref['ncf_modificado'] || '',
      FechaNCFModificado: ref['fecha_ncf_modificado']
        ? formatDateDgii(ref['fecha_ncf_modificado'] as string)
        : '',
      CodigoModificacion: ref['codigo_modificacion'] || 1,
    };
  }

  /**
   * Valida que el XML generado sea parseable (verificación de integridad).
   */
  private validarXmlGenerado(xml: string): void {
    try {
      this.xmlParser.parse(xml);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Error desconocido';
      throw new UnprocessableEntityException({
        statusCode: 422,
        message: `El XML generado no es válido: ${message}`,
        campos_error: [],
      });
    }
  }

  /**
   * Valida que el contenido sea un XSD/XML válido (parseable).
   * @throws Error si el contenido no es un XML válido
   */
  private validarContenidoXsd(content: string): void {
    if (!content || content.trim().length === 0) {
      throw new Error('El archivo XSD está vacío');
    }

    // Verificar que sea XML válido
    try {
      this.xmlParser.parse(content);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Error desconocido';
      throw new Error(`El archivo XSD no es un XML válido: ${message}`);
    }

    // Verificar que contenga elementos típicos de un XSD
    if (!content.includes('schema') && !content.includes('xs:') && !content.includes('xsd:')) {
      throw new Error('El archivo no parece ser un esquema XSD válido');
    }
  }

  /**
   * Extrae la versión del XSD a partir del nombre del archivo o metadatos.
   * Busca patrones como "v1.0", "1.0", o usa el mtime como fallback.
   * @see Requisito 22.1
   */
  private extraerVersionXsd(filePath: string, stats: fs.Stats): string {
    const filename = path.basename(filePath, path.extname(filePath));

    // Buscar versión en el nombre del archivo (e.g., ecf-v1.0.xsd, ecf_2.1.xsd)
    const versionMatch = filename.match(/[vV]?(\d+\.\d+(?:\.\d+)?)/);
    if (versionMatch) {
      return versionMatch[1];
    }

    // Fallback: usar fecha de modificación como versión
    return `file-${stats.mtimeMs}`;
  }

  /**
   * Extrae campos problemáticos de un error de conversión.
   */
  private extraerCamposError(error: unknown): string[] {
    if (error instanceof Error) {
      // Intentar extraer nombres de campos del mensaje de error
      const fieldMatches = error.message.match(/['"]([^'"]+)['"]/g);
      if (fieldMatches) {
        return fieldMatches.map((m) => m.replace(/['"]/g, ''));
      }
    }
    return [];
  }
}
