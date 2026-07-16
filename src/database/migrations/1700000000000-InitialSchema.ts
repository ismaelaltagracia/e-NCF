import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitialSchema1700000000000 implements MigrationInterface {
  name = 'InitialSchema1700000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create enums
    await queryRunner.query(`
      CREATE TYPE "estado_empresa_enum" AS ENUM ('activo', 'certificacion', 'inactivo')
    `);
    await queryRunner.query(`
      CREATE TYPE "rol_usuario_enum" AS ENUM ('admin', 'facturador', 'lector')
    `);
    await queryRunner.query(`
      CREATE TYPE "modo_ncf_enum" AS ENUM ('automatico', 'manual')
    `);
    await queryRunner.query(`
      CREATE TYPE "estado_dgii_enum" AS ENUM ('enviado', 'aceptado', 'rechazado', 'reintentando', 'fallido', 'aprobado', 'rechazado_definitivo', 'anulado')
    `);
    await queryRunner.query(`
      CREATE TYPE "tipo_comprobante_enum" AS ENUM ('E31', 'E32', 'E33', 'E34', 'E41', 'E43', 'E44', 'E45')
    `);
    await queryRunner.query(`
      CREATE TYPE "tipo_catalogo_enum" AS ENUM ('producto', 'servicio')
    `);
    await queryRunner.query(`
      CREATE TYPE "estado_token_enum" AS ENUM ('activo', 'revocado', 'expirado')
    `);

    // Create planes table
    await queryRunner.query(`
      CREATE TABLE "planes" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "nombre" varchar NOT NULL,
        "limite_facturas_mensual" integer NOT NULL,
        "precio" decimal(10,2) NOT NULL,
        "activo" boolean NOT NULL DEFAULT true,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_planes_nombre" UNIQUE ("nombre"),
        CONSTRAINT "PK_planes" PRIMARY KEY ("id")
      )
    `);

    // Create empresas table
    await queryRunner.query(`
      CREATE TABLE "empresas" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "rnc" varchar NOT NULL,
        "nombre" varchar NOT NULL,
        "certificado_encriptado" bytea,
        "salt_encriptacion" bytea,
        "auth_tag" bytea,
        "estado" "estado_empresa_enum" NOT NULL DEFAULT 'certificacion',
        "plan_id" uuid,
        "modo_ncf" "modo_ncf_enum" NOT NULL DEFAULT 'automatico',
        "formato_pdf" varchar,
        "validar_rnc_receptor" boolean NOT NULL DEFAULT true,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_empresas_rnc" UNIQUE ("rnc"),
        CONSTRAINT "PK_empresas" PRIMARY KEY ("id"),
        CONSTRAINT "FK_empresas_plan" FOREIGN KEY ("plan_id") REFERENCES "planes"("id") ON DELETE SET NULL
      )
    `);

    // Create usuarios table
    await queryRunner.query(`
      CREATE TABLE "usuarios" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "empresa_id" uuid NOT NULL,
        "nombre" varchar NOT NULL,
        "email" varchar NOT NULL,
        "password_hash" varchar NOT NULL,
        "rol" "rol_usuario_enum" NOT NULL DEFAULT 'lector',
        "activo" boolean NOT NULL DEFAULT true,
        "intentos_fallidos" integer NOT NULL DEFAULT 0,
        "primer_intento_fallido" TIMESTAMP WITH TIME ZONE,
        "bloqueado_hasta" TIMESTAMP WITH TIME ZONE,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_usuarios_email" UNIQUE ("email"),
        CONSTRAINT "PK_usuarios" PRIMARY KEY ("id"),
        CONSTRAINT "FK_usuarios_empresa" FOREIGN KEY ("empresa_id") REFERENCES "empresas"("id") ON DELETE CASCADE
      )
    `);

    // Create super_admins table
    await queryRunner.query(`
      CREATE TABLE "super_admins" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "email" varchar NOT NULL,
        "password_hash" varchar NOT NULL,
        "nombre" varchar NOT NULL,
        "activo" boolean NOT NULL DEFAULT true,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_super_admins_email" UNIQUE ("email"),
        CONSTRAINT "PK_super_admins" PRIMARY KEY ("id")
      )
    `);

    // Create refresh_tokens table
    await queryRunner.query(`
      CREATE TABLE "refresh_tokens" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "usuario_id" uuid,
        "empresa_id" uuid,
        "token_hash" varchar NOT NULL,
        "estado" "estado_token_enum" NOT NULL DEFAULT 'activo',
        "expira_en" TIMESTAMP WITH TIME ZONE NOT NULL,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_refresh_tokens" PRIMARY KEY ("id"),
        CONSTRAINT "FK_refresh_tokens_usuario" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_refresh_tokens_empresa" FOREIGN KEY ("empresa_id") REFERENCES "empresas"("id") ON DELETE CASCADE
      )
    `);

    // Create api_keys table
    await queryRunner.query(`
      CREATE TABLE "api_keys" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "empresa_id" uuid NOT NULL,
        "nombre" varchar NOT NULL,
        "key_hash" varchar NOT NULL,
        "scopes" jsonb NOT NULL DEFAULT '[]',
        "activo" boolean NOT NULL DEFAULT true,
        "last_used_at" TIMESTAMP WITH TIME ZONE,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_api_keys" PRIMARY KEY ("id"),
        CONSTRAINT "FK_api_keys_empresa" FOREIGN KEY ("empresa_id") REFERENCES "empresas"("id") ON DELETE CASCADE
      )
    `);

    // Create facturas_electronicas table
    await queryRunner.query(`
      CREATE TABLE "facturas_electronicas" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "empresa_id" uuid NOT NULL,
        "usuario_id" uuid,
        "api_key_id" uuid,
        "e_ncf" varchar,
        "track_id" varchar,
        "estado_dgii" "estado_dgii_enum" NOT NULL DEFAULT 'enviado',
        "payload_json" jsonb NOT NULL,
        "xml_s3_url" varchar,
        "pdf_s3_url" varchar,
        "error_dgii" jsonb,
        "rnc_validado" boolean NOT NULL DEFAULT false,
        "correlation_id" varchar,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_facturas_electronicas" PRIMARY KEY ("id"),
        CONSTRAINT "FK_facturas_empresa" FOREIGN KEY ("empresa_id") REFERENCES "empresas"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_facturas_usuario" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE SET NULL,
        CONSTRAINT "FK_facturas_api_key" FOREIGN KEY ("api_key_id") REFERENCES "api_keys"("id") ON DELETE SET NULL,
        CONSTRAINT "chk_actor" CHECK ("usuario_id" IS NOT NULL OR "api_key_id" IS NOT NULL)
      )
    `);

    // Create catalogo_items table
    await queryRunner.query(`
      CREATE TABLE "catalogo_items" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "empresa_id" uuid NOT NULL,
        "tipo" "tipo_catalogo_enum" NOT NULL,
        "codigo" varchar NOT NULL,
        "descripcion" varchar NOT NULL,
        "precio_unitario" decimal(12,2) NOT NULL,
        "tasa_itbis" integer NOT NULL,
        "activo" boolean NOT NULL DEFAULT true,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_catalogo_items" PRIMARY KEY ("id"),
        CONSTRAINT "FK_catalogo_items_empresa" FOREIGN KEY ("empresa_id") REFERENCES "empresas"("id") ON DELETE CASCADE
      )
    `);

    // Create secuencias_ncf table
    await queryRunner.query(`
      CREATE TABLE "secuencias_ncf" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "empresa_id" uuid NOT NULL,
        "tipo_comprobante" varchar NOT NULL,
        "prefijo" varchar NOT NULL,
        "numero_inicio" bigint NOT NULL,
        "numero_fin" bigint NOT NULL,
        "numero_actual" bigint NOT NULL,
        "activo" boolean NOT NULL DEFAULT true,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_secuencias_ncf" PRIMARY KEY ("id"),
        CONSTRAINT "FK_secuencias_ncf_empresa" FOREIGN KEY ("empresa_id") REFERENCES "empresas"("id") ON DELETE CASCADE,
        CONSTRAINT "uq_secuencia_empresa_tipo_prefijo" UNIQUE ("empresa_id", "tipo_comprobante", "prefijo")
      )
    `);

    // Create uso_mensual table
    await queryRunner.query(`
      CREATE TABLE "uso_mensual" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "empresa_id" uuid NOT NULL,
        "anio" integer NOT NULL,
        "mes" integer NOT NULL,
        "facturas_generadas" integer NOT NULL DEFAULT 0,
        "limite_aplicado" integer NOT NULL,
        "plan_nombre" varchar NOT NULL,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_uso_mensual" PRIMARY KEY ("id"),
        CONSTRAINT "FK_uso_mensual_empresa" FOREIGN KEY ("empresa_id") REFERENCES "empresas"("id") ON DELETE CASCADE,
        CONSTRAINT "uq_uso_empresa_periodo" UNIQUE ("empresa_id", "anio", "mes")
      )
    `);

    // Create auditoria table
    await queryRunner.query(`
      CREATE TABLE "auditoria" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "empresa_id" uuid,
        "usuario_id" uuid,
        "api_key_id" uuid,
        "accion" varchar NOT NULL,
        "recurso_tipo" varchar NOT NULL,
        "recurso_id" uuid,
        "datos_anteriores" jsonb,
        "datos_nuevos" jsonb,
        "ip_origen" varchar,
        "correlation_id" uuid,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_auditoria" PRIMARY KEY ("id"),
        CONSTRAINT "FK_auditoria_empresa" FOREIGN KEY ("empresa_id") REFERENCES "empresas"("id") ON DELETE SET NULL,
        CONSTRAINT "FK_auditoria_usuario" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE SET NULL,
        CONSTRAINT "FK_auditoria_api_key" FOREIGN KEY ("api_key_id") REFERENCES "api_keys"("id") ON DELETE SET NULL
      )
    `);

    // Create webhooks table
    await queryRunner.query(`
      CREATE TABLE "webhooks" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "empresa_id" uuid NOT NULL,
        "url" varchar NOT NULL,
        "eventos" jsonb NOT NULL DEFAULT '[]',
        "secret" varchar NOT NULL,
        "activo" boolean NOT NULL DEFAULT true,
        "fallos_consecutivos" integer NOT NULL DEFAULT 0,
        "last_delivery_at" TIMESTAMP WITH TIME ZONE,
        "last_delivery_status" varchar,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_webhooks" PRIMARY KEY ("id"),
        CONSTRAINT "FK_webhooks_empresa" FOREIGN KEY ("empresa_id") REFERENCES "empresas"("id") ON DELETE CASCADE
      )
    `);

    // Create indices
    await queryRunner.query(
      `CREATE INDEX "idx_facturas_empresa_id" ON "facturas_electronicas" ("empresa_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_facturas_estado_dgii" ON "facturas_electronicas" ("estado_dgii")`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_facturas_created_at" ON "facturas_electronicas" ("created_at")`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_catalogo_empresa_activo" ON "catalogo_items" ("empresa_id", "activo")`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_auditoria_empresa_created" ON "auditoria" ("empresa_id", "created_at")`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_refresh_tokens_hash" ON "refresh_tokens" ("token_hash")`,
    );
    await queryRunner.query(`CREATE INDEX "idx_api_keys_hash" ON "api_keys" ("key_hash")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop indices
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_api_keys_hash"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_refresh_tokens_hash"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_auditoria_empresa_created"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_catalogo_empresa_activo"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_facturas_created_at"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_facturas_estado_dgii"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_facturas_empresa_id"`);

    // Drop tables in reverse order
    await queryRunner.query(`DROP TABLE IF EXISTS "webhooks"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "auditoria"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "uso_mensual"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "secuencias_ncf"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "catalogo_items"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "facturas_electronicas"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "api_keys"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "refresh_tokens"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "super_admins"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "usuarios"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "empresas"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "planes"`);

    // Drop enums
    await queryRunner.query(`DROP TYPE IF EXISTS "estado_token_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "tipo_catalogo_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "tipo_comprobante_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "estado_dgii_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "modo_ncf_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "rol_usuario_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "estado_empresa_enum"`);
  }
}
