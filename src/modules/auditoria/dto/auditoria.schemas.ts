import { z } from 'zod';

/**
 * Acciones fiscalmente relevantes que se registran en auditoría.
 * Req 31.1
 */
export const ACCIONES_AUDITORIA = [
  'factura_enviada',
  'factura_anulada',
  'certificado_subido',
  'certificado_reemplazado',
  'configuracion_cambiada',
  'usuario_creado',
  'usuario_desactivado',
  'plan_cambiado',
  'secuencia_creada',
  'api_key_creada',
  'api_key_revocada',
] as const;

export type AccionAuditoria = (typeof ACCIONES_AUDITORIA)[number];

/**
 * Schema para query params del listado de auditoría.
 * Req 31.3
 */
export const ListAuditoriaQuerySchema = z.object({
  accion: z
    .enum(ACCIONES_AUDITORIA, { message: 'Acción no válida' })
    .optional(),

  fecha_desde: z
    .string()
    .datetime({ message: 'fecha_desde debe ser ISO 8601' })
    .optional(),

  fecha_hasta: z
    .string()
    .datetime({ message: 'fecha_hasta debe ser ISO 8601' })
    .optional(),

  usuario_id: z
    .string()
    .uuid({ message: 'usuario_id debe ser un UUID válido' })
    .optional(),

  page: z
    .string()
    .optional()
    .default('1')
    .transform((val) => parseInt(val, 10))
    .pipe(z.number().int().positive()),

  limit: z
    .string()
    .optional()
    .default('20')
    .transform((val) => parseInt(val, 10))
    .pipe(z.number().int().min(1).max(100)),
});

export type ListAuditoriaQueryDto = z.infer<typeof ListAuditoriaQuerySchema>;

/**
 * Schema para query params del listado global de auditoría (Super_Admin).
 * Req 31.4
 */
export const ListAuditoriaGlobalQuerySchema = ListAuditoriaQuerySchema.extend({
  empresa_id: z
    .string()
    .uuid({ message: 'empresa_id debe ser un UUID válido' })
    .optional(),
});

export type ListAuditoriaGlobalQueryDto = z.infer<typeof ListAuditoriaGlobalQuerySchema>;

/**
 * Interface para registrar un evento de auditoría internamente.
 * Req 31.2
 */
export interface RegistrarAuditoriaDto {
  empresa_id?: string | null;
  usuario_id?: string | null;
  api_key_id?: string | null;
  accion: AccionAuditoria;
  recurso_tipo: string;
  recurso_id?: string | null;
  datos_anteriores?: Record<string, unknown> | null;
  datos_nuevos?: Record<string, unknown> | null;
  ip_origen?: string | null;
  correlation_id?: string | null;
}
