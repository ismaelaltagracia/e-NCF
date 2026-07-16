import { z } from 'zod';
import { TipoCatalogo } from '../../../database/enums.js';

/**
 * Schema de validación para crear un ítem del catálogo.
 * Req 25.1, 25.7, 25.8
 */
export const CreateCatalogoItemSchema = z.object({
  tipo: z.nativeEnum(TipoCatalogo, {
    message: 'tipo debe ser "producto" o "servicio"',
  }),

  codigo: z.string().min(1, 'codigo es requerido').max(50, 'codigo no puede exceder 50 caracteres'),

  descripcion: z
    .string()
    .min(1, 'descripcion es requerida')
    .max(255, 'descripcion no puede exceder 255 caracteres'),

  precio_unitario: z
    .number({ message: 'precio_unitario debe ser un número' })
    .positive('precio_unitario debe ser positivo')
    .refine(
      (val) => {
        const parts = val.toString().split('.');
        return !parts[1] || parts[1].length <= 2;
      },
      { message: 'precio_unitario debe tener máximo 2 decimales' },
    ),

  tasa_itbis: z
    .number({ message: 'tasa_itbis debe ser un número' })
    .refine((val) => [0, 16, 18].includes(val), {
      message: 'tasa_itbis debe ser 0, 16 o 18',
    }),
});

export type CreateCatalogoItemDto = z.infer<typeof CreateCatalogoItemSchema>;

/**
 * Schema de validación para actualizar un ítem del catálogo.
 * Req 25.3
 */
export const UpdateCatalogoItemSchema = z.object({
  tipo: z
    .nativeEnum(TipoCatalogo, {
      message: 'tipo debe ser "producto" o "servicio"',
    })
    .optional(),

  codigo: z
    .string()
    .min(1, 'codigo es requerido')
    .max(50, 'codigo no puede exceder 50 caracteres')
    .optional(),

  descripcion: z
    .string()
    .min(1, 'descripcion es requerida')
    .max(255, 'descripcion no puede exceder 255 caracteres')
    .optional(),

  precio_unitario: z
    .number({ message: 'precio_unitario debe ser un número' })
    .positive('precio_unitario debe ser positivo')
    .refine(
      (val) => {
        const parts = val.toString().split('.');
        return !parts[1] || parts[1].length <= 2;
      },
      { message: 'precio_unitario debe tener máximo 2 decimales' },
    )
    .optional(),

  tasa_itbis: z
    .number({ message: 'tasa_itbis debe ser un número' })
    .refine((val) => [0, 16, 18].includes(val), {
      message: 'tasa_itbis debe ser 0, 16 o 18',
    })
    .optional(),
});

export type UpdateCatalogoItemDto = z.infer<typeof UpdateCatalogoItemSchema>;

/**
 * Schema para query params de listado.
 * Req 25.2, 25.9
 */
export const ListCatalogoQuerySchema = z.object({
  tipo: z.nativeEnum(TipoCatalogo).optional(),
  activo: z
    .enum(['true', 'false'])
    .transform((val) => val === 'true')
    .optional(),
  search: z.string().optional(),
});

export type ListCatalogoQueryDto = z.infer<typeof ListCatalogoQuerySchema>;
