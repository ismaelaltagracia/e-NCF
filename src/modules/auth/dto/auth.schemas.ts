import { z } from 'zod';

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
