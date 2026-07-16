import { z } from 'zod';

/**
 * Schema para la contraseña del certificado PKCS12 enviada en el body.
 * El archivo se maneja via multer (multipart/form-data).
 */
export const CertificadoPasswordSchema = z.object({
  password: z
    .string({ error: 'La contraseña del certificado es requerida' })
    .min(1, 'La contraseña del certificado es requerida'),
});

export type CertificadoPasswordDto = z.infer<typeof CertificadoPasswordSchema>;

/** Extensiones de archivo permitidas */
export const ALLOWED_EXTENSIONS = ['.p12', '.pfx'];

/** Tamaño máximo del archivo: 10 KB */
export const MAX_FILE_SIZE = 10 * 1024;
