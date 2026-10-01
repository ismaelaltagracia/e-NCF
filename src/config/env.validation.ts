import { z } from 'zod';

/**
 * Validación de variables de entorno al arranque.
 *
 * Falla rápido (antes de aceptar tráfico) si faltan o son inválidas variables
 * críticas: claves de cifrado/JWT, base de datos y ambiente. Esto evita que la
 * aplicación arranque en un estado inseguro (por ejemplo, con `synchronize`
 * activo por un NODE_ENV mal escrito, o sin ENCRYPTION_KEY válida).
 */
const envSchema = z.object({
  NODE_ENV: z
    .enum(['development', 'production', 'test'])
    .default('development'),

  PORT: z.coerce.number().int().positive().default(3000),

  // Base de datos
  DB_HOST: z.string().min(1),
  DB_PORT: z.coerce.number().int().positive().default(5432),
  DB_NAME: z.string().min(1),
  DB_USER: z.string().min(1),
  DB_PASSWORD: z.string().min(1),

  // Redis
  REDIS_HOST: z.string().min(1),
  REDIS_PORT: z.coerce.number().int().positive().default(6379),
  REDIS_PASSWORD: z.string().optional().default(''),

  // JWT (rutas a las claves PEM)
  JWT_PRIVATE_KEY_PATH: z.string().min(1),
  JWT_PUBLIC_KEY_PATH: z.string().min(1),

  // Cifrado de certificados: hex de exactamente 32 bytes (64 caracteres)
  ENCRYPTION_KEY: z
    .string()
    .regex(/^[0-9a-fA-F]{64}$/, 'ENCRYPTION_KEY debe ser un hex de 32 bytes (64 caracteres)'),

  // CORS: lista separada por comas
  CORS_ORIGINS: z.string().optional().default(''),
});

export type ValidatedEnv = z.infer<typeof envSchema>;

/**
 * Función de validación consumida por `ConfigModule.forRoot({ validate })`.
 * Lanza un error con el detalle de todas las variables inválidas si algo falla.
 */
export function validateEnv(config: Record<string, unknown>): Record<string, unknown> {
  const parsed = envSchema.safeParse(config);

  if (!parsed.success) {
    const detalles = parsed.error.issues
      .map((issue) => `  - ${issue.path.join('.') || '(raíz)'}: ${issue.message}`)
      .join('\n');
    throw new Error(
      `Configuración de entorno inválida. Corrija las siguientes variables:\n${detalles}`,
    );
  }

  // Devolver el config original (con los valores por defecto aplicados) para que
  // ConfigService siga sirviendo todas las variables, no solo las validadas.
  return { ...config, ...parsed.data };
}
