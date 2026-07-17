import {
  Injectable,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { XMLBuilder } from 'fast-xml-parser';

import { FirmaService } from './firma.service.js';
import { DgiiTokenService } from './token.service.js';
import { CircuitBreakerService } from './circuit-breaker.service.js';

/** Namespace estándar de la DGII para anulación de e-CF */
const DGII_ANULACION_NAMESPACE = 'urn:dgii.gov.do:ecf:anulacion:2019';

/** Timeout para la transmisión de anulación */
const TIMEOUT_MS = 30_000;

/**
 * Parámetros de entrada para la anulación de un e-CF.
 */
export interface AnulacionParams {
  factura_id: string;
  empresa_id: string;
  e_ncf: string;
  rnc_emisor: string;
  motivo: string;
  correlation_id: string;
}

/**
 * Resultado de la solicitud de anulación a la DGII.
 */
export interface AnulacionResult {
  exito: boolean;
  mensaje?: string;
  error_dgii?: Record<string, unknown>;
}

/**
 * Servicio de anulación de comprobantes fiscales electrónicos (e-CF).
 *
 * Flujo:
 * 1. Generar XML de anulación conforme al esquema DGII
 * 2. Firmar con XAdES-BES usando el certificado de la empresa
 * 3. Obtener Bearer Token via DgiiTokenService
 * 4. Transmitir al endpoint de anulación DGII via CircuitBreaker
 * 5. Retornar resultado (éxito o rechazo con detalles)
 *
 * @see Requisitos 30.1, 30.2, 30.3, 30.4
 */
@Injectable()
export class AnulacionService {
  private readonly logger = new Logger(AnulacionService.name);
  private readonly dgiiAnulacionUrl: string;
  private readonly xmlBuilder: XMLBuilder;

  constructor(
    private readonly firmaService: FirmaService,
    private readonly tokenService: DgiiTokenService,
    private readonly circuitBreaker: CircuitBreakerService,
    private readonly configService: ConfigService,
  ) {
    this.dgiiAnulacionUrl = this.configService.get<string>(
      'DGII_ANULACION_URL',
      'https://ecf.dgii.gov.do/CerteCF/AnulacionCF',
    );

    this.xmlBuilder = new XMLBuilder({
      ignoreAttributes: false,
      attributeNamePrefix: '@_',
      format: true,
      suppressEmptyNode: false,
    });
  }

  /**
   * Ejecuta la anulación de un e-CF ante la DGII.
   *
   * @param params - Parámetros de anulación
   * @returns Resultado con éxito/fracaso y detalles de error si aplica
   * @throws UnprocessableEntityException si la DGII rechaza la anulación
   *
   * @see Requisitos 30.2, 30.3, 30.4
   */
  async anular(params: AnulacionParams): Promise<AnulacionResult> {
    this.logger.log(
      `Anulando e-CF: factura=${params.factura_id}, e_ncf=${params.e_ncf}, empresa=${params.empresa_id}, correlationId=${params.correlation_id}`,
    );

    // Step 1: Generate annulment XML
    const xmlAnulacion = this.generarXmlAnulacion(params);

    // Step 2: Sign XML with XAdES-BES
    const xmlFirmado = await this.firmaService.firmarEcf(xmlAnulacion, params.empresa_id);

    // Step 3: Get Bearer Token
    const token = await this.tokenService.obtenerToken(params.empresa_id);

    // Step 4: Transmit via CircuitBreaker
    const resultado = await this.circuitBreaker.execute(
      () => this.transmitirAnulacion(xmlFirmado, token, params.correlation_id),
      `anulacion-ecf:${params.factura_id}`,
    );

    return resultado;
  }

  /**
   * Genera el XML de anulación conforme al esquema DGII.
   *
   * @param params - Parámetros de anulación
   * @returns XML string del documento de anulación
   */
  private generarXmlAnulacion(params: AnulacionParams): string {
    const fechaAnulacion = new Date().toISOString();

    const anulacionDocument = {
      AnulacioneCF: {
        '@_xmlns': DGII_ANULACION_NAMESPACE,
        Encabezado: {
          RNCEmisor: params.rnc_emisor,
          eNCF: params.e_ncf,
          FechaHoraAnulacion: fechaAnulacion,
        },
        DetalleAnulacion: {
          CantidadeNCFAnulados: 1,
          RangoNCFAnulados: {
            Desde: params.e_ncf,
            Hasta: params.e_ncf,
          },
          MotivoAnulacion: params.motivo,
        },
      },
    };

    const xmlBody = this.xmlBuilder.build(anulacionDocument);
    return `<?xml version="1.0" encoding="UTF-8"?>\n${xmlBody}`;
  }

  /**
   * Transmite el XML de anulación firmado al endpoint DGII.
   *
   * @param xmlFirmado - XML firmado de anulación
   * @param token - Bearer Token para autenticación
   * @param correlationId - ID de correlación para trazabilidad
   * @returns Resultado de la anulación
   */
  private async transmitirAnulacion(
    xmlFirmado: string,
    token: string,
    correlationId: string,
  ): Promise<AnulacionResult> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

    let response: Response;
    try {
      response = await fetch(this.dgiiAnulacionUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/xml',
          Authorization: `Bearer ${token}`,
          'X-Correlation-Id': correlationId,
        },
        body: xmlFirmado,
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
    } catch (error: unknown) {
      clearTimeout(timeoutId);
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(
        `Error de red contactando endpoint de anulación DGII: ${message}, correlationId=${correlationId}`,
      );
      throw new Error(`Error de red contactando DGII: ${message}`);
    }

    const responseBody = await response.text();

    // Success: DGII confirmed the annulment
    if (response.ok) {
      this.logger.log(
        `Anulación confirmada por DGII: correlationId=${correlationId}`,
      );
      return {
        exito: true,
        mensaje: 'Anulación confirmada por la DGII',
      };
    }

    // Business rejection (4xx) - DGII rejected the annulment
    if (response.status >= 400 && response.status < 500) {
      let errorDgii: Record<string, unknown> = {};
      try {
        errorDgii = JSON.parse(responseBody) as Record<string, unknown>;
      } catch {
        errorDgii = { raw_response: responseBody, status_code: response.status };
      }

      this.logger.warn(
        `DGII rechazó la anulación: HTTP ${response.status}, correlationId=${correlationId}`,
      );

      return {
        exito: false,
        error_dgii: errorDgii,
      };
    }

    // Server error (5xx) - throw to trigger circuit breaker
    this.logger.error(
      `Endpoint de anulación DGII respondió con HTTP ${response.status}: ${responseBody}, correlationId=${correlationId}`,
    );
    throw new Error(
      `Endpoint de anulación DGII respondió con error ${response.status}: ${responseBody}`,
    );
  }
}
