import { z } from 'zod';

export const CreateFacturaRecibidaSchema = z.object({
  rnc_emisor: z
    .string({ message: 'rnc_emisor es requerido' })
    .refine((val) => /^\d+$/.test(val), {
      message: 'rnc_emisor debe contener exclusivamente dígitos numéricos',
    })
    .refine((val) => val.length === 9 || val.length === 11, {
      message: 'rnc_emisor debe tener exactamente 9 u 11 caracteres',
    }),

  nombre_emisor: z
    .string({ message: 'nombre_emisor es requerido' })
    .min(1, 'nombre_emisor no puede estar vacío'),

  e_ncf: z
    .string({ message: 'e_ncf es requerido' })
    .refine((val) => /^[A-Z]\d{2}\d{10}$/.test(val), {
      message: 'e_ncf debe tener formato válido (ej: E310000000001)',
    }),

  fecha_emision: z
    .string({ message: 'fecha_emision es requerida' })
    .refine((val) => !isNaN(Date.parse(val)), {
      message: 'fecha_emision debe ser una fecha válida',
    }),

  monto_total: z
    .number({ message: 'monto_total debe ser un número' })
    .refine((val) => val > 0, {
      message: 'monto_total debe ser mayor a 0',
    }),
});

export type CreateFacturaRecibidaDto = z.infer<typeof CreateFacturaRecibidaSchema>;

export const RechazarFacturaRecibidaSchema = z.object({
  motivo: z
    .string({ message: 'motivo es requerido' })
    .min(1, 'motivo no puede estar vacío')
    .max(500, 'motivo no puede exceder 500 caracteres'),
});

export type RechazarFacturaRecibidaDto = z.infer<typeof RechazarFacturaRecibidaSchema>;
