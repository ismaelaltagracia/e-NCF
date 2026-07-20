import { z } from 'zod';
import { EstadoDgii, TipoComprobante } from '../../../database/enums.js';

/**
 * Schema de validación para query params de listado de facturas.
 * Soporta paginación y filtros por estado DGII, fecha, RNC, tipo comprobante y e-NCF.
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

  tipo_comprobante: z.nativeEnum(TipoComprobante).optional(),

  fecha_desde: z.string().optional(),

  fecha_hasta: z.string().optional(),

  rnc_receptor: z.string().optional(),

  e_ncf: z.string().optional(),

  ambiente: z.string().optional(),
});

export type ListFacturasQueryDto = z.infer<typeof ListFacturasQuerySchema>;
