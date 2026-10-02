import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Tabla de tokens de recuperación de contraseña (single-use).
 *
 * En BD solo se persiste el hash SHA-256 del token crudo que viaja en el enlace
 * enviado por email. Soporta usuarios de empresa (`usuario_id`) y super admins
 * (`super_admin_id`): exactamente una de las dos columnas estará poblada.
 *
 * Idempotente: usa IF NOT EXISTS para no chocar con un esquema ya creado por
 * synchronize en el primer arranque.
 */
export class PasswordResetTokens1700000000004 implements MigrationInterface {
  name = 'PasswordResetTokens1700000000004';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "password_reset_tokens" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "usuario_id" uuid,
        "super_admin_id" uuid,
        "token_hash" character varying NOT NULL,
        "expira_en" TIMESTAMP WITH TIME ZONE NOT NULL,
        "usado" boolean NOT NULL DEFAULT false,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_password_reset_tokens" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_password_reset_tokens_hash"
      ON "password_reset_tokens" ("token_hash")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_password_reset_tokens_hash"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "password_reset_tokens"`);
  }
}
