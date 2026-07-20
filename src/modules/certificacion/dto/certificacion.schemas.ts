import { z } from 'zod';

/**
 * Esquema para la respuesta de un paso de certificación individual.
 */
export const PasoCertificacionResultSchema = z.object({
  paso: z.number(),
  nombre: z.string(),
  estado: z.enum(['exitoso', 'fallido', 'omitido', 'pendiente']),
  mensaje: z.string().optional(),
  e_ncf: z.string().optional(),
  track_id: z.string().nullable().optional(),
  error: z.string().optional(),
});

export type PasoCertificacionResult = z.infer<typeof PasoCertificacionResultSchema>;

/**
 * Esquema para la respuesta completa de la ejecución de certificación.
 */
export const EjecucionCertificacionResponseSchema = z.object({
  ejecutado_en: z.string(),
  duracion_ms: z.number(),
  resumen: z.object({
    exitosos: z.number(),
    fallidos: z.number(),
    omitidos: z.number(),
  }),
  pasos: z.array(PasoCertificacionResultSchema),
});

export type EjecucionCertificacionResponse = z.infer<typeof EjecucionCertificacionResponseSchema>;

/**
 * Esquema para un paso del progreso integrador.
 */
export const PasoIntegradorSchema = z.object({
  paso: z.number(),
  nombre: z.string(),
  completado: z.boolean(),
  factura_id: z.string().optional(),
  e_ncf: z.string().optional(),
  completado_en: z.string().optional(),
  requisito: z.string().optional(),
});

export type PasoIntegrador = z.infer<typeof PasoIntegradorSchema>;

/**
 * Esquema para la respuesta del progreso integrador.
 */
export const ProgresoIntegradorResponseSchema = z.object({
  modo: z.literal('integrador'),
  progreso: z.number(),
  total: z.literal(15),
  porcentaje: z.number(),
  pasos: z.array(PasoIntegradorSchema),
});

export type ProgresoIntegradorResponse = z.infer<typeof ProgresoIntegradorResponseSchema>;
