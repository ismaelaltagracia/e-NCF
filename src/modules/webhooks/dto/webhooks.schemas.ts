import { z } from 'zod';

/**
 * Eventos válidos para webhooks.
 * Req 32.5
 */
export const WEBHOOK_EVENTOS = [
  'factura_aceptada',
  'factura_rechazada',
  'factura_anulada',
  'secuencia_agotandose',
  'plan_limite_alcanzado',
] as const;

export type WebhookEvento = (typeof WEBHOOK_EVENTOS)[number];

/**
 * Schema para crear un webhook.
 * Req 32.1
 */
export const CreateWebhookSchema = z.object({
  url: z
    .string()
    .url('url debe ser una URL válida')
    .refine((val) => val.startsWith('https://'), {
      message: 'url debe usar HTTPS',
    }),

  eventos: z
    .array(z.enum(WEBHOOK_EVENTOS, { error: 'Evento no válido' }))
    .min(1, 'Debe especificar al menos un evento'),

  secret: z
    .string()
    .min(16, 'secret debe tener al menos 16 caracteres')
    .optional(),
});

export type CreateWebhookDto = z.infer<typeof CreateWebhookSchema>;
