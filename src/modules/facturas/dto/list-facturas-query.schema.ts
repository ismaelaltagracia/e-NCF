import { z } from 'zod';
import { EstadoDgii } from '../../../database/enums.js';

/**
 * Schema de validación para query params de listado de facturas.
 * Soporta paginación y filtro por estado DGII.
 *
 * @see Requirements 18.5, 18.7
 */
export const ListFacturasQuerySchema = z.object({
  page: z
    .string()
    .optional()
    .default('1')
    .transform((val) => parseInt(val, 10))
    .refine((val) => val >= 1, { message: 'page debe ser >= 1' }),

  limit: z
    .string()
    .optional()
    .default('20')
    .transform((val) => Math.min(parseInt(val, 10), 100))
    .refine((val) => val >= 1, { message: 'limit debe ser >= 1' }),

  estado_dgii: z.nativeEnum(EstadoDgii).optional(),
});

export type ListFacturasQueryDto = z.infer<typeof ListFacturasQuerySchema>;
