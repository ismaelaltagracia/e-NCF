import { MigrationInterface, QueryRunner } from 'typeorm';

export class RncContribuyentes1700000000001 implements MigrationInterface {
  name = 'RncContribuyentes1700000000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "rnc_contribuyentes" (
        "rnc" varchar(11) NOT NULL,
        "razon_social" varchar(255) NOT NULL DEFAULT '',
        "actividad_economica" varchar(255) NOT NULL DEFAULT '',
        "fecha_inicio_operaciones" varchar(20) NOT NULL DEFAULT '',
        "estado" varchar(30) NOT NULL DEFAULT 'ACTIVO',
        "regimen_pago" varchar(30) NOT NULL DEFAULT 'NORMAL',
        CONSTRAINT "PK_rnc_contribuyentes" PRIMARY KEY ("rnc")
      )
    `);

    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_rnc_contribuyentes_estado" ON "rnc_contribuyentes" ("estado")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "rnc_contribuyentes"`);
  }
}
