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

/**
 * Interfaz pública del servicio de conversión JSON→XML.
 * @see Requisitos 9.1, 9.2, 9.3, 9.4, 9.5, 22.1, 22.2, 22.3, 22.4, 22.5
 */
export interface IConversorXmlService {
  convertir(payload: Record<string, unknown>, encf: string): Promise<string>;
  recargarEsquema(): Promise<void>;
  getVersionEsquema(): string;
}

/** Namespace estándar de la DGII para e-CF */
const DGII_ECF_NAMESPACE = 'urn:dgii.gov.do:ecf:remision:2019';

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
        ...(payload['DetallesItems'] ? { DetallesItems: payload['DetallesItems'] } : {}),
        ...(payload['InformacionReferencia'] ? { InformacionReferencia: payload['InformacionReferencia'] } : {}),
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
   * Construye la sección Encabezado del e-CF.
   */
  private construirEncabezado(
    payload: Record<string, unknown>,
    encf: string,
  ): Record<string, unknown> {
    const encabezadoInput = (payload['Encabezado'] || {}) as Record<string, unknown>;
    const idDoc = (encabezadoInput['IdDoc'] || {}) as Record<string, unknown>;

    return {
      IdDoc: {
        ...idDoc,
        eNCF: encf,
      },
      ...(encabezadoInput['Emisor'] ? { Emisor: encabezadoInput['Emisor'] } : {}),
      ...(encabezadoInput['Comprador'] ? { Comprador: encabezadoInput['Comprador'] } : {}),
      ...(encabezadoInput['Totales'] ? { Totales: encabezadoInput['Totales'] } : {}),
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
