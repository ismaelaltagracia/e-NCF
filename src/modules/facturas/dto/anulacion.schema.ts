import { z } from 'zod';

/**
 * Schema de validación para la solicitud de anulación de e-CF.
 * @see Requisito 30.1
 */
export const AnulacionSchema = z.object({
  motivo: z
    .string({ message: 'El motivo de anulación es obligatorio' })
    .min(1, 'El motivo de anulación no puede estar vacío')
    .max(500, 'El motivo de anulación no puede exceder 500 caracteres'),
});

export type AnulacionDto = z.infer<typeof AnulacionSchema>;
