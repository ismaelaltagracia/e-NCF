import { z } from 'zod';

/**
 * Schema de validación para el registro de empresa + usuario admin.
 * Req 1.1: nombre empresa (max 150), RNC (9 u 11 alfanuméricos),
 *          nombre admin (max 100), email (RFC 5322), contraseña (min 8, mayúscula, minúscula, dígito)
 */
export const RegistroSchema = z.object({
  empresa_nombre: z
    .string()
    .min(1, 'Nombre de empresa requerido')
    .max(150, 'Nombre de empresa no puede exceder 150 caracteres'),

  rnc: z
    .string()
    .regex(/^[A-Za-z0-9]{9}$|^[A-Za-z0-9]{11}$/, 'RNC debe tener 9 u 11 caracteres alfanuméricos'),

  admin_nombre: z
    .string()
    .min(1, 'Nombre de administrador requerido')
    .max(100, 'Nombre de administrador no puede exceder 100 caracteres'),

  email: z.string().email('Email inválido'),

  password: z
    .string()
    .min(8, 'Contraseña debe tener al menos 8 caracteres')
    .regex(/[A-Z]/, 'Contraseña debe contener al menos una letra mayúscula')
    .regex(/[a-z]/, 'Contraseña debe contener al menos una letra minúscula')
    .regex(/[0-9]/, 'Contraseña debe contener al menos un dígito'),
});

export type RegistroDto = z.infer<typeof RegistroSchema>;
