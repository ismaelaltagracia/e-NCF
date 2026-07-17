import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { createHmac } from 'crypto';

import { Webhook } from '../../database/entities/webhook.entity.js';
import type { CreateWebhookDto, WebhookEvento } from './dto/webhooks.schemas.js';

export interface WebhookPayload {
  evento: string;
  timestamp: string;
  data: Record<string, unknown>;
}

/**
 * Servicio para gestión y entrega de webhooks.
 * Req 32.1, 32.2, 32.3, 32.4, 32.5, 32.6, 32.7, 32.8
 */
@Injectable()
export class WebhooksService {
  private readonly logger = new Logger(WebhooksService.name);

  /** Delays de reintento en ms: 10s, 30s, 90s */
  private readonly retryDelays = [10_000, 30_000, 90_000];

  /** Máximo de fallos consecutivos antes de auto-desactivar */
  private readonly maxFallosConsecutivos = 10;

  /** Timeout para entregas HTTP en ms */
  private readonly deliveryTimeout = 10_000;

  constructor(
    @InjectRepository(Webhook)
    private readonly webhookRepo: Repository<Webhook>,
  ) {}

  /**
   * Crear un nuevo webhook para una empresa.
   * Req 32.1
   */
  async crear(empresaId: string, dto: CreateWebhookDto): Promise<Webhook> {
    const webhook = this.webhookRepo.create({
      empresa_id: empresaId,
      url: dto.url,
      eventos: dto.eventos,
      secret: dto.secret ?? '',
      activo: true,
      fallos_consecutivos: 0,
    });

    return this.webhookRepo.save(webhook);
  }

  /**
   * Listar webhooks activos de una empresa (sin exponer secret).
   * Req 32.2
   */
  async listar(empresaId: string): Promise<Omit<Webhook, 'secret'>[]> {
    const webhooks = await this.webhookRepo.find({
      where: { empresa_id: empresaId, activo: true },
      order: { created_at: 'DESC' },
    });

    return webhooks.map(({ secret: _secret, ...rest }) => rest);
  }

  /**
   * Desactivar un webhook verificando propiedad.
   * Req 32.3
   */
  async desactivar(webhookId: string, empresaId: string): Promise<void> {
    const webhook = await this.webhookRepo.findOne({
      where: { id: webhookId, empresa_id: empresaId },
    });

    if (!webhook) {
      throw new NotFoundException('Webhook no encontrado');
    }

    webhook.activo = false;
    await this.webhookRepo.save(webhook);
  }

  /**
   * Enviar un evento de prueba al webhook.
   * Req 32.4
   */
  async probar(
    webhookId: string,
    empresaId: string,
  ): Promise<{ status: number; success: boolean }> {
    const webhook = await this.webhookRepo.findOne({
      where: { id: webhookId, empresa_id: empresaId, activo: true },
    });

    if (!webhook) {
      throw new NotFoundException('Webhook no encontrado');
    }

    const testPayload: WebhookPayload = {
      evento: 'test',
      timestamp: new Date().toISOString(),
      data: { message: 'Evento de prueba' },
    };

    const result = await this.entregarWebhook(webhook, testPayload);
    return result;
  }

  /**
   * Disparar evento a todos los webhooks activos que lo escuchan.
   * Req 32.5, 32.6
   */
  async disparar(
    empresaId: string,
    evento: WebhookEvento,
    data: Record<string, unknown>,
  ): Promise<void> {
    const webhooks = await this.webhookRepo.find({
      where: { empresa_id: empresaId, activo: true },
    });

    const matching = webhooks.filter((wh) => wh.eventos.includes(evento));

    const payload: WebhookPayload = {
      evento,
      timestamp: new Date().toISOString(),
      data,
    };

    // Entregar en paralelo sin bloquear
    await Promise.allSettled(
      matching.map((wh) => this.entregarWebhook(wh, payload)),
    );
  }

  /**
   * Entregar payload a un webhook con timeout, reintentos y auto-desactivación.
   * Timeout: 10s, Reintentos: 3 (delays: 10s, 30s, 90s)
   * Auto-desactivar tras 10 fallos consecutivos.
   * HMAC-SHA256 en X-Webhook-Signature si secret configurado.
   * Req 32.6, 32.7, 32.8
   */
  async entregarWebhook(
    webhook: Webhook,
    payload: WebhookPayload,
  ): Promise<{ status: number; success: boolean }> {
    const body = JSON.stringify(payload);
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (webhook.secret) {
      headers['X-Webhook-Signature'] = this.computeHmac(webhook.secret, body);
    }

    let lastStatus = 0;
    let success = false;

    // Intento inicial + 3 reintentos
    for (let attempt = 0; attempt <= this.retryDelays.length; attempt++) {
      if (attempt > 0) {
        await this.delay(this.retryDelays[attempt - 1]);
      }

      try {
        const controller = new AbortController();
        const timeout = setTimeout(
          () => controller.abort(),
          this.deliveryTimeout,
        );

        const response = await fetch(webhook.url, {
          method: 'POST',
          headers,
          body,
          signal: controller.signal,
        });

        clearTimeout(timeout);
        lastStatus = response.status;

        if (response.ok) {
          success = true;
          break;
        }
      } catch (error) {
        this.logger.warn(
          `Webhook delivery attempt ${attempt + 1} failed for ${webhook.id}: ${(error as Error).message}`,
        );
        lastStatus = 0;
      }
    }

    // Actualizar estado del webhook
    if (success) {
      webhook.fallos_consecutivos = 0;
      webhook.last_delivery_status = 'success';
    } else {
      webhook.fallos_consecutivos += 1;
      webhook.last_delivery_status = `failed:${lastStatus}`;

      if (webhook.fallos_consecutivos >= this.maxFallosConsecutivos) {
        webhook.activo = false;
        this.logger.warn(
          `Webhook ${webhook.id} auto-desactivado tras ${this.maxFallosConsecutivos} fallos consecutivos`,
        );
      }
    }

    webhook.last_delivery_at = new Date();
    await this.webhookRepo.save(webhook);

    return { status: lastStatus, success };
  }

  /**
   * Computar HMAC-SHA256 del body usando el secret como clave.
   * Req 32.7
   */
  computeHmac(secret: string, body: string): string {
    return createHmac('sha256', secret).update(body).digest('hex');
  }

  /**
   * Utilidad para esperar un delay (facilita testing).
   */
  delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
