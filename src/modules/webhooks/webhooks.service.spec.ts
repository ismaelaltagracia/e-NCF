import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException } from '@nestjs/common';
import { createHmac } from 'crypto';

import { WebhooksService } from './webhooks.service.js';
import { Webhook } from '../../database/entities/webhook.entity.js';

describe('WebhooksService', () => {
  let service: WebhooksService;
  let mockRepo: {
    create: jest.Mock;
    save: jest.Mock;
    find: jest.Mock;
    findOne: jest.Mock;
  };

  beforeEach(async () => {
    mockRepo = {
      create: jest.fn((data) => ({ id: 'wh-1', ...data })),
      save: jest.fn((entity) => Promise.resolve(entity)),
      find: jest.fn(),
      findOne: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WebhooksService,
        {
          provide: getRepositoryToken(Webhook),
          useValue: mockRepo,
        },
      ],
    }).compile();

    service = module.get<WebhooksService>(WebhooksService);
    // Override delay to avoid waiting in tests
    jest.spyOn(service, 'delay').mockResolvedValue(undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('computeHmac', () => {
    it('should compute HMAC-SHA256 correctly', () => {
      const secret = 'my-super-secret-key-123';
      const body = JSON.stringify({ evento: 'test', data: { id: '123' } });

      const result = service.computeHmac(secret, body);

      const expected = createHmac('sha256', secret).update(body).digest('hex');
      expect(result).toBe(expected);
    });

    it('should produce different signatures for different secrets', () => {
      const body = '{"test": true}';
      const sig1 = service.computeHmac('secret-one-abcdef', body);
      const sig2 = service.computeHmac('secret-two-abcdef', body);

      expect(sig1).not.toBe(sig2);
    });

    it('should produce different signatures for different bodies', () => {
      const secret = 'shared-secret-12345';
      const sig1 = service.computeHmac(secret, '{"a":1}');
      const sig2 = service.computeHmac(secret, '{"a":2}');

      expect(sig1).not.toBe(sig2);
    });
  });

  describe('auto-disable after 10 consecutive failures', () => {
    it('should auto-disable webhook after 10 consecutive failures', async () => {
      const webhook: Webhook = {
        id: 'wh-1',
        empresa_id: 'emp-1',
        url: 'https://example.com/hook',
        eventos: ['factura_aceptada'],
        secret: '',
        activo: true,
        fallos_consecutivos: 9,
        last_delivery_at: null,
        last_delivery_status: null,
        created_at: new Date(),
        empresa: {} as any,
      };

      // Mock fetch to always fail
      global.fetch = jest.fn().mockRejectedValue(new Error('Connection refused'));

      const result = await service.entregarWebhook(webhook, {
        evento: 'factura_aceptada',
        timestamp: new Date().toISOString(),
        data: {},
      });

      expect(result.success).toBe(false);
      expect(webhook.fallos_consecutivos).toBe(10);
      expect(webhook.activo).toBe(false);
      expect(mockRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ activo: false }),
      );
    });

    it('should not auto-disable webhook if failures are below threshold', async () => {
      const webhook: Webhook = {
        id: 'wh-2',
        empresa_id: 'emp-1',
        url: 'https://example.com/hook',
        eventos: ['factura_aceptada'],
        secret: '',
        activo: true,
        fallos_consecutivos: 5,
        last_delivery_at: null,
        last_delivery_status: null,
        created_at: new Date(),
        empresa: {} as any,
      };

      global.fetch = jest.fn().mockRejectedValue(new Error('timeout'));

      await service.entregarWebhook(webhook, {
        evento: 'factura_aceptada',
        timestamp: new Date().toISOString(),
        data: {},
      });

      expect(webhook.fallos_consecutivos).toBe(6);
      expect(webhook.activo).toBe(true);
    });

    it('should reset consecutive failures on successful delivery', async () => {
      const webhook: Webhook = {
        id: 'wh-3',
        empresa_id: 'emp-1',
        url: 'https://example.com/hook',
        eventos: ['factura_aceptada'],
        secret: '',
        activo: true,
        fallos_consecutivos: 7,
        last_delivery_at: null,
        last_delivery_status: null,
        created_at: new Date(),
        empresa: {} as any,
      };

      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
      });

      const result = await service.entregarWebhook(webhook, {
        evento: 'factura_aceptada',
        timestamp: new Date().toISOString(),
        data: {},
      });

      expect(result.success).toBe(true);
      expect(webhook.fallos_consecutivos).toBe(0);
      expect(webhook.activo).toBe(true);
    });
  });

  describe('retry logic', () => {
    it('should retry up to 3 times after initial failure', async () => {
      const webhook: Webhook = {
        id: 'wh-4',
        empresa_id: 'emp-1',
        url: 'https://example.com/hook',
        eventos: ['factura_aceptada'],
        secret: '',
        activo: true,
        fallos_consecutivos: 0,
        last_delivery_at: null,
        last_delivery_status: null,
        created_at: new Date(),
        empresa: {} as any,
      };

      global.fetch = jest.fn().mockRejectedValue(new Error('fail'));

      await service.entregarWebhook(webhook, {
        evento: 'factura_aceptada',
        timestamp: new Date().toISOString(),
        data: {},
      });

      // 1 initial + 3 retries = 4 attempts
      expect(global.fetch).toHaveBeenCalledTimes(4);
      expect(service.delay).toHaveBeenCalledTimes(3);
      expect(service.delay).toHaveBeenNthCalledWith(1, 10_000);
      expect(service.delay).toHaveBeenNthCalledWith(2, 30_000);
      expect(service.delay).toHaveBeenNthCalledWith(3, 90_000);
    });

    it('should succeed on retry without further attempts', async () => {
      const webhook: Webhook = {
        id: 'wh-5',
        empresa_id: 'emp-1',
        url: 'https://example.com/hook',
        eventos: ['factura_aceptada'],
        secret: '',
        activo: true,
        fallos_consecutivos: 0,
        last_delivery_at: null,
        last_delivery_status: null,
        created_at: new Date(),
        empresa: {} as any,
      };

      global.fetch = jest
        .fn()
        .mockRejectedValueOnce(new Error('fail'))
        .mockRejectedValueOnce(new Error('fail'))
        .mockResolvedValueOnce({ ok: true, status: 200 });

      const result = await service.entregarWebhook(webhook, {
        evento: 'factura_aceptada',
        timestamp: new Date().toISOString(),
        data: {},
      });

      expect(result.success).toBe(true);
      expect(global.fetch).toHaveBeenCalledTimes(3);
    });
  });

  describe('event matching (disparar)', () => {
    it('should only deliver to webhooks subscribed to the event', async () => {
      const webhooks: Webhook[] = [
        {
          id: 'wh-a',
          empresa_id: 'emp-1',
          url: 'https://a.com/hook',
          eventos: ['factura_aceptada', 'factura_rechazada'],
          secret: '',
          activo: true,
          fallos_consecutivos: 0,
          last_delivery_at: null,
          last_delivery_status: null,
          created_at: new Date(),
          empresa: {} as any,
        },
        {
          id: 'wh-b',
          empresa_id: 'emp-1',
          url: 'https://b.com/hook',
          eventos: ['factura_anulada'],
          secret: '',
          activo: true,
          fallos_consecutivos: 0,
          last_delivery_at: null,
          last_delivery_status: null,
          created_at: new Date(),
          empresa: {} as any,
        },
      ];

      mockRepo.find.mockResolvedValue(webhooks);
      global.fetch = jest.fn().mockResolvedValue({ ok: true, status: 200 });

      await service.disparar('emp-1', 'factura_aceptada', { ncf: 'E310000000001' });

      // Only wh-a matches factura_aceptada
      expect(global.fetch).toHaveBeenCalledTimes(1);
      expect(global.fetch).toHaveBeenCalledWith(
        'https://a.com/hook',
        expect.objectContaining({
          method: 'POST',
        }),
      );
    });

    it('should not deliver if no webhooks match the event', async () => {
      mockRepo.find.mockResolvedValue([
        {
          id: 'wh-c',
          empresa_id: 'emp-1',
          url: 'https://c.com/hook',
          eventos: ['secuencia_agotandose'],
          secret: '',
          activo: true,
          fallos_consecutivos: 0,
          last_delivery_at: null,
          last_delivery_status: null,
          created_at: new Date(),
          empresa: {} as any,
        },
      ]);

      global.fetch = jest.fn().mockResolvedValue({ ok: true, status: 200 });

      await service.disparar('emp-1', 'factura_aceptada', {});

      expect(global.fetch).not.toHaveBeenCalled();
    });
  });

  describe('HMAC signature in delivery', () => {
    it('should include X-Webhook-Signature header when secret is configured', async () => {
      const webhook: Webhook = {
        id: 'wh-hmac',
        empresa_id: 'emp-1',
        url: 'https://example.com/hook',
        eventos: ['factura_aceptada'],
        secret: 'my-secret-key-1234',
        activo: true,
        fallos_consecutivos: 0,
        last_delivery_at: null,
        last_delivery_status: null,
        created_at: new Date(),
        empresa: {} as any,
      };

      global.fetch = jest.fn().mockResolvedValue({ ok: true, status: 200 });

      const payload = {
        evento: 'factura_aceptada',
        timestamp: '2024-01-01T00:00:00.000Z',
        data: { ncf: 'E310000000001' },
      };

      await service.entregarWebhook(webhook, payload);

      const body = JSON.stringify(payload);
      const expectedSig = createHmac('sha256', 'my-secret-key-1234')
        .update(body)
        .digest('hex');

      expect(global.fetch).toHaveBeenCalledWith(
        'https://example.com/hook',
        expect.objectContaining({
          headers: expect.objectContaining({
            'X-Webhook-Signature': expectedSig,
          }),
        }),
      );
    });

    it('should NOT include X-Webhook-Signature header when secret is empty', async () => {
      const webhook: Webhook = {
        id: 'wh-no-hmac',
        empresa_id: 'emp-1',
        url: 'https://example.com/hook',
        eventos: ['factura_aceptada'],
        secret: '',
        activo: true,
        fallos_consecutivos: 0,
        last_delivery_at: null,
        last_delivery_status: null,
        created_at: new Date(),
        empresa: {} as any,
      };

      global.fetch = jest.fn().mockResolvedValue({ ok: true, status: 200 });

      await service.entregarWebhook(webhook, {
        evento: 'factura_aceptada',
        timestamp: '2024-01-01T00:00:00.000Z',
        data: {},
      });

      expect(global.fetch).toHaveBeenCalledWith(
        'https://example.com/hook',
        expect.objectContaining({
          headers: {
            'Content-Type': 'application/json',
          },
        }),
      );
    });
  });

  describe('desactivar', () => {
    it('should throw NotFoundException if webhook does not exist', async () => {
      mockRepo.findOne.mockResolvedValue(null);

      await expect(
        service.desactivar('non-existent', 'emp-1'),
      ).rejects.toThrow(NotFoundException);
    });

    it('should set activo=false for existing webhook', async () => {
      const webhook = {
        id: 'wh-1',
        empresa_id: 'emp-1',
        activo: true,
      };
      mockRepo.findOne.mockResolvedValue(webhook);

      await service.desactivar('wh-1', 'emp-1');

      expect(webhook.activo).toBe(false);
      expect(mockRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ activo: false }),
      );
    });
  });
});
