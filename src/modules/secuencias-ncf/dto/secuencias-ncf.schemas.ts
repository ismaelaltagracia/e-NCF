import { z } from 'zod';
import { TipoComprobante } from '../../../database/enums.js';

/**
 * Schema de validación para crear una secuencia NCF.
 * Req 28.2
 */
export const CreateSecuenciaNcfSchema = z
  .object({
    tipo_comprobante: z.nativeEnum(TipoComprobante, {
      message: 'tipo_comprobante debe ser un tipo válido (E31, E32, E33, E34, E41, E43, E44, E45)',
    }),

    prefijo: z
      .string()
      .min(1, 'prefijo es requerido')
      .max(20, 'prefijo no puede exceder 20 caracteres'),

    numero_inicio: z
      .number({ message: 'numero_inicio debe ser un número' })
      .int('numero_inicio debe ser un entero')
      .positive('numero_inicio debe ser mayor a 0'),

    numero_fin: z
      .number({ message: 'numero_fin debe ser un número' })
      .int('numero_fin debe ser un entero')
      .positive('numero_fin debe ser mayor a 0'),
  })
  .refine((data) => data.numero_fin > data.numero_inicio, {
    message: 'numero_fin debe ser mayor que numero_inicio',
    path: ['numero_fin'],
  });

export type CreateSecuenciaNcfDto = z.infer<typeof CreateSecuenciaNcfSchema>;

/**
 * Schema de validación para actualizar una secuencia NCF.
 * Permite desactivar o editar campos de la secuencia.
 * Req 28.4
 */
export const UpdateSecuenciaNcfSchema = z.object({
  activo: z.boolean().optional(),
  prefijo: z.string().min(1).max(20).optional(),
  numero_fin: z.number().int().positive().optional(),
  numero_actual: z.number().int().positive().optional(),
});

export type UpdateSecuenciaNcfDto = z.infer<typeof UpdateSecuenciaNcfSchema>;
