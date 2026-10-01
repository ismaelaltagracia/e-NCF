import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Sincroniza el enum SQL `tipo_comprobante_enum` con el enum de la aplicación,
 * añadiendo los tipos E46 (Exportaciones) y E47 (Pagos al Exterior) que faltaban
 * respecto a `TipoComprobante` en el código.
 *
 * Se usa ADD VALUE IF NOT EXISTS para que sea idempotente. PostgreSQL no permite
 * quitar valores de un enum, por lo que la migración inversa es un no-op.
 */
export class TipoComprobanteE46E47_1700000000002 implements MigrationInterface {
  name = 'TipoComprobanteE46E47_1700000000002';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TYPE "tipo_comprobante_enum" ADD VALUE IF NOT EXISTS 'E46'`,
    );
    await queryRunner.query(
      `ALTER TYPE "tipo_comprobante_enum" ADD VALUE IF NOT EXISTS 'E47'`,
    );
  }

  public async down(): Promise<void> {
    // PostgreSQL no soporta eliminar valores de un enum; no-op intencional.
  }
}
