import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { randomUUID } from 'crypto';

import { FacturaElectronica } from '../database/entities/factura-electronica.entity.js';
import { EstadoDgii } from '../database/enums.js';
import { CircuitBreakerService } from './circuit-breaker.service.js';
import { DgiiTokenService } from './token.service.js';
import { WebhooksService } from '../modules/webhooks/webhooks.service.js';

/**
 * Respuesta del servicio de consulta de estado de la DGII.
 */
export interface DgiiStatusResponse {
  trackId: string;
  estado: 'aceptado' | 'aprobado' | 'rechazado_definitivo';
  detalles?: Record<string, unknown>;
}


/**
 * Servicio de polling periódico del estado DGII para facturas con estado "aceptado".
 *
 * Consulta el servicio de estado de la DGII para determinar si las facturas
 * han alcanzado un estado terminal (aprobado, rechazado_definitivo).
 *
 * @see Requisitos 29.1, 29.2, 29.3, 29.4, 29.5, 29.6
 */
@Injectable()
export class EstadoPollingService {
  private readonly logger = new Logger(EstadoPollingService.name);
  private readonly dgiiStatusUrl: string;
  private readonly pollingIntervalMs: number;
  private readonly timeoutMs = 30_000;

  constructor(
    @InjectRepository(FacturaElectronica)
    private readonly facturaRepo: Repository<FacturaElectronica>,
    private readonly circuitBreaker: CircuitBreakerService,
    private readonly tokenService: DgiiTokenService,
    private readonly webhooksService: WebhooksService,
    private readonly configService: ConfigService,
  ) {
    this.dgiiStatusUrl = this.configService.get<string>(
      'DGII_STATUS_ENDPOINT',
      'https://ecf.dgii.gov.do/CerteCF/ConsultaEstado',
    );
    this.pollingIntervalMs = this.configService.get<number>(
      'DGII_POLLING_INTERVAL_MS',
      300_000,
    );
  }

  /**
   * Polling periódico que consulta el estado DGII para facturas con estado "aceptado".
   * Intervalo configurable vía DGII_POLLING_INTERVAL_MS (default: 5 minutos).
   *
   * @see Requisito 29.1: Consultar periódicamente con Track_ID
   * @see Requisito 29.4: Si DGII inalcanzable, log y reintentar en el próximo ciclo
   * @see Requisito 29.5: Dejar de consultar al alcanzar estado terminal
   */
  @Interval('estado-polling', 300_000)
  async pollEstados(): Promise<void> {
    this.logger.debug('Iniciando ciclo de polling de estado DGII');

    const facturasAceptadas = await this.facturaRepo.find({
      where: {
        estado_dgii: EstadoDgii.ACEPTADO,
      },
    });

    // Filter only those with a track_id
    const facturasConTrackId = facturasAceptadas.filter(
      (f) => f.track_id != null,
    );

    if (facturasConTrackId.length === 0) {
      this.logger.debug('No hay facturas con estado "aceptado" para consultar');
      return;
    }

    this.logger.log(
      `Consultando estado DGII para ${facturasConTrackId.length} factura(s)`,
    );

    for (const factura of facturasConTrackId) {
      await this.consultarEstadoFactura(factura);
    }
  }

  /**
   * Consulta el estado DGII de una factura individual.
   * Si el servicio DGII es inalcanzable, se loguea el error y se reintenta en el siguiente ciclo.
   *
   * @see Requisito 29.4: Manejo de errores sin afectar otras operaciones
   */
  async consultarEstadoFactura(factura: FacturaElectronica): Promise<void> {
    const correlationId = factura.correlation_id || randomUUID();

    try {
      const statusResponse = await this.consultarDgiiStatus(
        factura.track_id!,
        factura.empresa_id,
        correlationId,
        factura.ambiente,
      );

      if (statusResponse && this.esEstadoTerminal(statusResponse.estado)) {
        await this.actualizarEstadoTerminal(
          factura,
          statusResponse,
          correlationId,
        );
      }
    } catch (error: unknown) {
      // Req 29.4: Log error y continuar con las demás facturas
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `Error consultando estado DGII para factura ${factura.id} (track_id=${factura.track_id}): ${message}`,
        undefined,
        `correlationId=${correlationId}`,
      );
    }
  }

  /**
   * Llama al endpoint de consulta de estado DGII a través del circuit breaker.
   *
   * @param trackId - Track_ID de la factura
   * @param empresaId - ID de la empresa para autenticación
   * @param correlationId - ID de correlación para trazabilidad
   * @param ambiente - Ambiente DGII de la factura
   * @returns Respuesta del servicio de estado DGII o null si no hay cambio
   */
  async consultarDgiiStatus(
    trackId: string,
    empresaId: string,
    correlationId: string,
    ambiente?: string,
  ): Promise<DgiiStatusResponse | null> {
    const token = await this.tokenService.obtenerToken(empresaId, ambiente);

    const result = await this.circuitBreaker.execute(
      () => this.llamarStatusEndpoint(trackId, token, correlationId, ambiente),
      `status-polling:${trackId}`,
    );

    return result;
  }

  /**
   * Realiza la llamada HTTP al endpoint de consulta de estado DGII.
   */
  private async llamarStatusEndpoint(
    trackId: string,
    token: string,
    correlationId: string,
    ambiente?: string,
  ): Promise<DgiiStatusResponse | null> {
    const baseUrl = ambiente === 'produccion'
      ? this.dgiiStatusUrl.replace('CerteCF', 'ECF')
      : this.dgiiStatusUrl;
    const url = `${baseUrl}/${trackId}`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

    let response: Response;
    try {
      response = await fetch(url, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${token}`,
          'X-Correlation-Id': correlationId,
        },
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
    } catch (error: unknown) {
      clearTimeout(timeoutId);
      const message = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(
        `DGII status service unreachable: ${message}`,
      );
    }

    if (!response.ok) {
      if (response.status >= 500) {
        throw new Error(
          `DGII status service returned ${response.status}`,
        );
      }
      // 4xx responses - log but don't throw (may indicate track_id issues)
      this.logger.warn(
        `DGII status service returned ${response.status} for trackId=${trackId}, correlationId=${correlationId}`,
      );
      return null;
    }

    const body = await response.text();
    return this.parseStatusResponse(body, trackId);
  }

  /**
   * Parsea la respuesta del servicio de estado DGII.
   * Intenta parsear como JSON primero, luego como XML.
   */
  private parseStatusResponse(
    responseBody: string,
    trackId: string,
  ): DgiiStatusResponse | null {
    // Intentar parsear como JSON
    try {
      const json = JSON.parse(responseBody) as Record<string, unknown>;
      const estado = (json.estado as string)?.toLowerCase();

      if (
        estado === 'aprobado' ||
        estado === 'rechazado_definitivo'
      ) {
        return {
          trackId,
          estado: estado as 'aprobado' | 'rechazado_definitivo',
          detalles: json,
        };
      }

      // Estado no terminal (sigue en "aceptado"), no hay cambio
      return null;
    } catch {
      // No es JSON, intentar parsear XML
    }

    // Intentar extraer estado de XML
    const estadoMatch = responseBody.match(
      /<(?:[a-zA-Z_][\w.-]*:)?[Ee]stado[^>]*>([\s\S]*?)<\/(?:[a-zA-Z_][\w.-]*:)?[Ee]stado>/,
    );

    if (estadoMatch?.[1]) {
      const estado = estadoMatch[1].trim().toLowerCase();
      if (estado === 'aprobado' || estado === 'rechazado_definitivo') {
        return {
          trackId,
          estado: estado as 'aprobado' | 'rechazado_definitivo',
          detalles: { raw_response: responseBody },
        };
      }
    }

    // No hay cambio de estado
    return null;
  }

  /**
   * Actualiza la factura a estado terminal y dispara webhook si corresponde.
   *
   * @see Requisito 29.2: Actualizar estado_dgii y error_dgii si rechazado
   * @see Requisito 29.6: Disparar webhook al transicionar a estado terminal
   */
  private async actualizarEstadoTerminal(
    factura: FacturaElectronica,
    statusResponse: DgiiStatusResponse,
    correlationId: string,
  ): Promise<void> {
    const nuevoEstado =
      statusResponse.estado === 'aprobado'
        ? EstadoDgii.APROBADO
        : EstadoDgii.RECHAZADO_DEFINITIVO;

    // Req 29.2: Update estado_dgii and store DGII response details in error_dgii if rejected
    if (nuevoEstado === EstadoDgii.RECHAZADO_DEFINITIVO && statusResponse.detalles) {
      await this.facturaRepo.update(factura.id, {
        estado_dgii: nuevoEstado,
        error_dgii: statusResponse.detalles,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any);
    } else {
      await this.facturaRepo.update(factura.id, {
        estado_dgii: nuevoEstado,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any);
    }

    this.logger.log(
      `Factura ${factura.id} transicionó a estado terminal: ${nuevoEstado}, correlationId=${correlationId}`,
    );

    // Req 29.6: Disparar webhook al cambiar a estado terminal
    await this.dispararWebhookEstadoTerminal(
      factura,
      nuevoEstado,
      statusResponse,
    );
  }

  /**
   * Dispara un webhook para notificar la transición a estado terminal.
   *
   * @see Requisito 29.6
   */
  private async dispararWebhookEstadoTerminal(
    factura: FacturaElectronica,
    nuevoEstado: EstadoDgii,
    statusResponse: DgiiStatusResponse,
  ): Promise<void> {
    try {
      const evento =
        nuevoEstado === EstadoDgii.APROBADO
          ? 'factura_aceptada'
          : 'factura_rechazada';

      await this.webhooksService.disparar(
        factura.empresa_id,
        evento as 'factura_aceptada' | 'factura_rechazada',
        {
          factura_id: factura.id,
          e_ncf: factura.e_ncf,
          track_id: factura.track_id,
          estado_dgii: nuevoEstado,
          detalles: statusResponse.detalles ?? null,
        },
      );
    } catch (error: unknown) {
      // Don't fail the polling operation if webhook delivery fails
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(
        `Error disparando webhook para factura ${factura.id}: ${message}`,
      );
    }
  }

  /**
   * Verifica si un estado es terminal (aprobado, rechazado_definitivo, anulado).
   * @see Requisito 29.5
   */
  private esEstadoTerminal(estado: string): boolean {
    return ['aprobado', 'rechazado_definitivo', 'anulado'].includes(
      estado.toLowerCase(),
    );
  }

  /**
   * Returns the configured polling interval in milliseconds.
   * Useful for testing and monitoring.
   */
  getPollingIntervalMs(): number {
    return this.pollingIntervalMs;
  }
}
