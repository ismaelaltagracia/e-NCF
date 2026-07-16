import { z } from 'zod';

/**
 * Schema de validación para crear un usuario.
 * Req 3.1: nombre completo, correo electrónico, contraseña y rol.
 */
export const CreateUsuarioSchema = z.object({
  nombre: z
    .string()
    .min(1, 'Nombre es requerido')
    .max(100, 'Nombre no puede exceder 100 caracteres'),

  email: z.string().email('Email inválido'),

  password: z
    .string()
    .min(8, 'Contraseña debe tener al menos 8 caracteres')
    .regex(/[A-Z]/, 'Contraseña debe contener al menos una letra mayúscula')
    .regex(/[a-z]/, 'Contraseña debe contener al menos una letra minúscula')
    .regex(/[0-9]/, 'Contraseña debe contener al menos un dígito'),

  rol: z.enum(['admin', 'facturador', 'lector'], {
    error: 'Rol debe ser admin, facturador o lector',
  }),
});

export type CreateUsuarioDto = z.infer<typeof CreateUsuarioSchema>;

/**
 * Schema de validación para actualizar un usuario.
 * Req 3.3, 3.6: actualizar rol o desactivar.
 */
export const UpdateUsuarioSchema = z
  .object({
    rol: z
      .enum(['admin', 'facturador', 'lector'], {
        error: 'Rol debe ser admin, facturador o lector',
      })
      .optional(),

    activo: z.boolean().optional(),
  })
  .refine((data) => data.rol !== undefined || data.activo !== undefined, {
    message: 'Debe proporcionar al menos un campo para actualizar (rol o activo)',
  });

export type UpdateUsuarioDto = z.infer<typeof UpdateUsuarioSchema>;
