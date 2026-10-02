import { z } from 'zod';

/**
 * Regla de complejidad de contraseña compartida (misma que onboarding y creación
 * de usuarios): mínimo 8 caracteres, con mayúscula, minúscula y dígito.
 */
export const passwordComplexitySchema = z
  .string()
  .min(8, 'Contraseña debe tener al menos 8 caracteres')
  .regex(/[A-Z]/, 'Contraseña debe contener al menos una letra mayúscula')
  .regex(/[a-z]/, 'Contraseña debe contener al menos una letra minúscula')
  .regex(/[0-9]/, 'Contraseña debe contener al menos un dígito');

export const LoginSchema = z.object({
  email: z.string().email('Email inválido'),
  password: z.string().min(1, 'Contraseña requerida'),
});

export type LoginDto = z.infer<typeof LoginSchema>;

export const RefreshSchema = z.object({
  refresh_token: z.string().uuid('Refresh token inválido'),
});

export type RefreshDto = z.infer<typeof RefreshSchema>;

export const LogoutSchema = z.object({
  refresh_token: z.string().uuid('Refresh token inválido'),
});

export type LogoutDto = z.infer<typeof LogoutSchema>;

/**
 * Cambio de contraseña por elección (usuario autenticado).
 */
export const ChangePasswordSchema = z
  .object({
    password_actual: z.string().min(1, 'Contraseña actual requerida'),
    password_nueva: passwordComplexitySchema,
  })
  .refine((data) => data.password_actual !== data.password_nueva, {
    message: 'La nueva contraseña debe ser distinta de la actual',
    path: ['password_nueva'],
  });

export type ChangePasswordDto = z.infer<typeof ChangePasswordSchema>;

/**
 * Solicitud de recuperación de contraseña (olvidó la contraseña).
 */
export const ForgotPasswordSchema = z.object({
  email: z.string().email('Email inválido'),
});

export type ForgotPasswordDto = z.infer<typeof ForgotPasswordSchema>;

/**
 * Confirmación de recuperación: token del email + nueva contraseña.
 */
export const ResetPasswordSchema = z.object({
  token: z.string().min(1, 'Token requerido'),
  password_nueva: passwordComplexitySchema,
});

export type ResetPasswordDto = z.infer<typeof ResetPasswordSchema>;
