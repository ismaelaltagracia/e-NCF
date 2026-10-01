import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { XMLBuilder } from 'fast-xml-parser';

import { FirmaService } from './firma.service.js';
import { DgiiTokenService } from './token.service.js';
import { CircuitBreakerService } from './circuit-breaker.service.js';
import { formatDateDgii } from '../common/utils/date-format.js';

/** Namespace estándar de la DGII para la Aprobación Comercial (ACECF) */
const DGII_ACECF_NAMESPACE = 'urn:dgii.gov.do:ecf:acecf:2019';

/** Timeout para la transmisión de la aprobación comercial */
const TIMEOUT_MS = 30_000;

/**
 * Estado de la Aprobación Comercial según la DGII.
 * 1 = Aprobado, 2 = Rechazado.
 */
export enum EstadoAcecf {
  APROBADO = 1,
  RECHAZADO = 2,
}

/**
 * Parámetros para emitir una Aprobación Comercial (ACECF) sobre un e-CF recibido.
 * El emisor del ACECF es el COMPRADOR (la empresa que recibió el comprobante).
 */
export interface AprobacionComercialParams {
  empresa_id: string;
  /** RNC del comprador (empresa autenticada que aprueba/rechaza) */
  rnc_comprador: string;
  /** RNC del emisor del e-CF recibido */
  rnc_emisor: string;
  /** e-NCF del comprobante recibido */
  e_ncf: string;
  /** Fecha de emisión del comprobante recibido (ISO o dd-mm-yyyy) */
  fecha_emision: string;
  /** Monto total del comprobante recibido */
  monto_total: number;
  estado: EstadoAcecf;
  /** Detalle/motivo obligatorio cuando el estado es RECHAZADO */
  detalle_motivo?: string;
  correlation_id: string;
  ambiente?: string;
}

/**
 * Resultado de la transmisión de la Aprobación Comercial a la DGII.
 */
export interface AprobacionComercialResult {
  exito: boolean;
  mensaje?: string;
  error_dgii?: Record<string, unknown>;
}

/**
 * Servicio de Aprobación Comercial (ACECF) de comprobantes fiscales electrónicos.
 *
 * La Aprobación Comercial es el acuse que el comprador transmite a la DGII para
 * aceptar o rechazar comercialmente un e-CF recibido. Flujo:
 * 1. Generar el XML ACECF conforme al esquema DGII
 * 2. Firmar con XAdES-BES usando el certificado de la empresa compradora
 * 3. Obtener Bearer Token via DgiiTokenService
 * 4. Transmitir al endpoint de Aprobación Comercial de la DGII via CircuitBreaker
 *
 * @see Escenario 14 de certificación (Aprobación Comercial)
 */
@Injectable()
export class AprobacionComercialService {
  private readonly logger = new Logger(AprobacionComercialService.name);
  private readonly dgiiAcecfUrl: string;
  private readonly xmlBuilder: XMLBuilder;

  constructor(
    private readonly firmaService: FirmaService,
    private readonly tokenService: DgiiTokenService,
    private readonly circuitBreaker: CircuitBreakerService,
    private readonly configService: ConfigService,
  ) {
    this.dgiiAcecfUrl = this.configService.get<string>(
      'DGII_ACECF_URL',
      'https://ecf.dgii.gov.do/CerteCF/aprobacionComercial/api/AprobacionComercial',
    );

    this.xmlBuilder = new XMLBuilder({
      ignoreAttributes: false,
      attributeNamePrefix: '@_',
      format: true,
      suppressEmptyNode: false,
    });
  }

  /**
   * Emite la Aprobación Comercial (aceptación o rechazo) de un e-CF ante la DGII.
   */
  async aprobar(params: AprobacionComercialParams): Promise<AprobacionComercialResult> {
    this.logger.log(
      `Aprobación Comercial: e_ncf=${params.e_ncf}, estado=${params.estado}, empresa=${params.empresa_id}, correlationId=${params.correlation_id}`,
    );

    const xmlAcecf = this.generarXmlAcecf(params);
    const xmlFirmado = await this.firmaService.firmarEcf(xmlAcecf, params.empresa_id);
    const token = await this.tokenService.obtenerToken(params.empresa_id, params.ambiente);

    return this.circuitBreaker.execute(
      () => this.transmitir(xmlFirmado, token, params.correlation_id, params.ambiente),
      `acecf:${params.e_ncf}`,
    );
  }

  /**
   * Genera el XML de Aprobación Comercial conforme al esquema DGII.
   */
  private generarXmlAcecf(params: AprobacionComercialParams): string {
    const acecfDocument = {
      ACECF: {
        '@_xmlns': DGII_ACECF_NAMESPACE,
        DetalleAprobacionComercial: {
          Version: '1.0',
          RNCEmisor: params.rnc_emisor,
          eNCF: params.e_ncf,
          FechaEmision: formatDateDgii(params.fecha_emision),
          MontoTotal: Number(params.monto_total).toFixed(2),
          RNCComprador: params.rnc_comprador,
          Estado: params.estado,
          FechaHoraAprobacionComercial: new Date().toISOString(),
          ...(params.estado === EstadoAcecf.RECHAZADO && params.detalle_motivo
            ? { DetalleMotivoRechazo: params.detalle_motivo }
            : {}),
        },
      },
    };

    const xmlBody = this.xmlBuilder.build(acecfDocument);
    return `<?xml version="1.0" encoding="UTF-8"?>\n${xmlBody}`;
  }

  /**
   * Transmite el XML ACECF firmado al endpoint de la DGII.
   */
  private async transmitir(
    xmlFirmado: string,
    token: string,
    correlationId: string,
    ambiente?: string,
  ): Promise<AprobacionComercialResult> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);
    const url =
      ambiente === 'produccion'
        ? this.dgiiAcecfUrl.replace('/CerteCF/', '/eCF/')
        : this.dgiiAcecfUrl;

    // La DGII espera el ACECF firmado como multipart/form-data en el campo "xml".
    const formData = new FormData();
    const blob = new Blob([xmlFirmado], { type: 'application/xml' });
    formData.append('xml', blob, 'acecf.xml');

    let response: Response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${token}`,
          'X-Correlation-Id': correlationId,
        },
        body: formData,
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
    } catch (error: unknown) {
      clearTimeout(timeoutId);
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(
        `Error de red contactando endpoint ACECF DGII: ${message}, correlationId=${correlationId}`,
      );
      throw new Error(`Error de red contactando DGII: ${message}`);
    }

    const responseBody = await response.text();

    if (response.ok) {
      this.logger.log(`Aprobación Comercial confirmada por DGII: correlationId=${correlationId}`);
      return { exito: true, mensaje: 'Aprobación Comercial confirmada por la DGII' };
    }

    // Rechazo de negocio (4xx): la DGII no aceptó el ACECF
    if (response.status >= 400 && response.status < 500) {
      let errorDgii: Record<string, unknown> = {};
      try {
        errorDgii = JSON.parse(responseBody) as Record<string, unknown>;
      } catch {
        errorDgii = { raw_response: responseBody, status_code: response.status };
      }
      this.logger.warn(
        `DGII rechazó la Aprobación Comercial: HTTP ${response.status}, correlationId=${correlationId}`,
      );
      return { exito: false, error_dgii: errorDgii };
    }

    // Error de servidor (5xx): propagar para activar el circuit breaker
    this.logger.error(
      `Endpoint ACECF DGII respondió con HTTP ${response.status}: ${responseBody}, correlationId=${correlationId}`,
    );
    throw new Error(`Endpoint ACECF DGII respondió con error ${response.status}: ${responseBody}`);
  }
}
