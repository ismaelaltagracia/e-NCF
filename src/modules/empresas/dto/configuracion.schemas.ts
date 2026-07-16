import { z } from 'zod';
import { ModoNcf } from '../../../database/enums.js';

/**
 * Schema de validación para PATCH /api/v1/empresas/me/configuracion.
 * Permite actualizar la configuración de la empresa.
 * Req 28.8
 */
export const UpdateConfiguracionSchema = z
  .object({
    modo_ncf: z
      .nativeEnum(ModoNcf, {
        message: "modo_ncf debe ser 'automatico' o 'manual'",
      })
      .optional(),

    validar_rnc_receptor: z
      .boolean({ message: 'validar_rnc_receptor debe ser un booleano' })
      .optional(),

    formato_pdf: z
      .string()
      .max(50, 'formato_pdf no puede exceder 50 caracteres')
      .nullable()
      .optional(),
  })
  .refine(
    (data) =>
      data.modo_ncf !== undefined ||
      data.validar_rnc_receptor !== undefined ||
      data.formato_pdf !== undefined,
    {
      message: 'Debe proporcionar al menos un campo para actualizar',
    },
  );

export type UpdateConfiguracionDto = z.infer<typeof UpdateConfiguracionSchema>;

/**
 * Respuesta de la configuración actual de la empresa.
 */
export interface ConfiguracionResponse {
  modo_ncf: ModoNcf;
  validar_rnc_receptor: boolean;
  formato_pdf: string | null;
}
