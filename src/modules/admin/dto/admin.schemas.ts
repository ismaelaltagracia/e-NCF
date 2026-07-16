import { z } from 'zod';

export const CambiarPlanSchema = z.object({
  plan_id: z.string().uuid({ message: 'plan_id debe ser un UUID válido' }),
});

export type CambiarPlanDto = z.infer<typeof CambiarPlanSchema>;
