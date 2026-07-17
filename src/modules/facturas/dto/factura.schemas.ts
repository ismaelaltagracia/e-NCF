import { z } from 'zod';
import { TipoComprobante } from '../../../database/enums.js';

/**
 * Regex para validar formato e-NCF.
 * Formato: una letra mayúscula + 2 dígitos de tipo + 10 dígitos numéricos = 13 chars.
 * Ejemplo: E310000000001
 */
export const ENCF_FORMAT_REGEX = /^[A-Z]\d{2}\d{10}$/;

/**
 * Schema reutilizable para validar RNC (9 u 11 dígitos numéricos).
 * Req 8.3
 */
export const RncSchema = z
  .string({ message: 'RNC es requerido' })
  .refine((val) => /^\d+$/.test(val), {
    message: 'RNC debe contener exclusivamente dígitos numéricos',
  })
  .refine((val) => val.length === 9 || val.length === 11, {
    message: 'RNC debe tener exactamente 9 u 11 caracteres',
  });

/**
 * Schema de validación para un ítem individual de factura.
 * Req 8.1, 8.5
 */
export const FacturaItemSchema = z.object({
  descripcion: z
    .string({ message: 'descripcion es requerida' })
    .min(1, 'descripcion no puede estar vacía'),

  cantidad: z
    .number({ message: 'cantidad debe ser un número' })
    .refine((val) => val > 0, {
      message: 'cantidad debe ser mayor a 0',
    }),

  precio_unitario: z
    .number({ message: 'precio_unitario debe ser un número' })
    .refine((val) => val >= 0, {
      message: 'precio_unitario no puede ser negativo',
    }),

  tasa_itbis: z
    .number({ message: 'tasa_itbis debe ser un número' })
    .refine((val) => [0, 16, 18].includes(val), {
      message: 'tasa_itbis debe ser 0, 16 o 18',
    }),
});

export type FacturaItemDto = z.infer<typeof FacturaItemSchema>;

/**
 * Schema principal de validación para crear una factura electrónica.
 * Valida estructura, formato RNC, aritmética de montos e ITBIS.
 * Req 8.1, 8.2, 8.3, 8.4, 8.5, 8.6
 */
export const CreateFacturaSchema = z
  .object({
    rnc_emisor: RncSchema,

    rnc_receptor: RncSchema,

    items: z
      .array(FacturaItemSchema, { message: 'items debe ser un arreglo' })
      .min(1, 'Se requiere al menos 1 ítem en la factura'),

    subtotal: z
      .number({ message: 'subtotal debe ser un número' })
      .refine((val) => val >= 0, {
        message: 'subtotal no puede ser negativo',
      }),

    monto_itbis: z
      .number({ message: 'monto_itbis debe ser un número' })
      .refine((val) => val >= 0, {
        message: 'monto_itbis no puede ser negativo',
      }),

    monto_total: z
      .number({ message: 'monto_total debe ser un número' })
      .refine((val) => val > 0, {
        message: 'monto_total debe ser mayor a 0',
      }),

    tipo_comprobante: z.nativeEnum(TipoComprobante, {
      message:
        'tipo_comprobante debe ser un tipo válido (E31, E32, E33, E34, E41, E43, E44, E45)',
    }),

    e_ncf: z
      .string()
      .refine((val) => ENCF_FORMAT_REGEX.test(val), {
        message:
          'e_ncf debe tener formato válido: una letra mayúscula seguida de 2 dígitos de tipo y 8 dígitos numéricos (ej: E310000000001)',
      })
      .optional(),
  })
  .superRefine((data, ctx) => {
    // Validar subtotal ≈ suma de (cantidad * precio_unitario) por ítem
    const subtotalCalculado = data.items.reduce(
      (sum, item) => sum + item.cantidad * item.precio_unitario,
      0,
    );
    if (Math.abs(data.subtotal - subtotalCalculado) > 0.01) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `subtotal (${data.subtotal}) no coincide con la suma de ítems (${subtotalCalculado}). Tolerancia máxima: 0.01`,
        path: ['subtotal'],
      });
    }

    // Validar monto_itbis ≈ suma de ITBIS por ítem
    const itbisCalculado = data.items.reduce(
      (sum, item) =>
        sum + item.cantidad * item.precio_unitario * (item.tasa_itbis / 100),
      0,
    );
    if (Math.abs(data.monto_itbis - itbisCalculado) > 0.01) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `monto_itbis (${data.monto_itbis}) no coincide con el ITBIS calculado (${itbisCalculado}). Tolerancia máxima: 0.01`,
        path: ['monto_itbis'],
      });
    }

    // Validar monto_total ≈ subtotal + monto_itbis
    const totalEsperado = data.subtotal + data.monto_itbis;
    if (Math.abs(data.monto_total - totalEsperado) > 0.01) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `monto_total (${data.monto_total}) no coincide con subtotal + monto_itbis (${totalEsperado}). Tolerancia máxima: 0.01`,
        path: ['monto_total'],
      });
    }
  });

export type CreateFacturaDto = z.infer<typeof CreateFacturaSchema>;
