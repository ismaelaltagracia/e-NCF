import { z } from 'zod';

export const VALID_SCOPES = ['facturas:write', 'facturas:read', 'pdf:read', 'estado:read'] as const;

/**
 * Schema de validación para crear un API Key.
 * Req 4.1, 4.7, 4.8
 */
export const CreateApiKeySchema = z.object({
  nombre: z
    .string()
    .min(1, 'Nombre es requerido')
    .max(100, 'Nombre no puede exceder 100 caracteres'),

  scopes: z
    .array(z.string())
    .min(1, 'Debe proporcionar al menos un scope')
    .refine(
      (scopes: string[]) => {
        const invalidScopes = scopes.filter(
          (s: string) => !VALID_SCOPES.includes(s as (typeof VALID_SCOPES)[number]),
        );
        return invalidScopes.length === 0;
      },
      {
        message: `Scopes inválidos. Valores permitidos: ${VALID_SCOPES.join(', ')}`,
      },
    ),
});

export type CreateApiKeyDto = z.infer<typeof CreateApiKeySchema>;
