import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Row-Level Security (RLS) como red de seguridad multi-tenant.
 *
 * Habilita RLS en todas las tablas con columna `empresa_id` y crea una política
 * que autoriza el acceso a una fila cuando:
 *   - la variable de sesión `app.current_empresa` coincide con `empresa_id`, O
 *   - la variable no está seteada (cadena vacía) — modo compatibilidad.
 *
 * El modo compatibilidad evita romper el acceso a datos actual (que aún no
 * establece la variable por request). Para convertir RLS en una defensa estricta,
 * la aplicación debe:
 *   1. Conectarse con un rol SIN privilegio BYPASSRLS (no el owner).
 *   2. Ejecutar `SET LOCAL app.current_empresa = '<uuid>'` dentro de una transacción
 *      por request (ver TenantContextService), y endurecer la política quitando la
 *      cláusula de compatibilidad `current_setting(...) = ''`.
 *
 * Diseñada para no alterar el comportamiento vigente hasta que se adopte el patrón
 * transaccional por request. La reversa elimina políticas y desactiva RLS.
 *
 * IMPORTANTE (owner bypass): en PostgreSQL el DUEÑO de la tabla omite RLS salvo que
 * se use FORCE ROW LEVEL SECURITY. Como la app hoy se conecta con el rol dueño
 * (encf_user), estas políticas NO filtran para ese rol: son andamiaje. Para que RLS
 * sea una defensa efectiva hay que, además de setear app.current_empresa por request:
 *   - crear un rol de aplicación SIN ser dueño de las tablas y conectar la app con él, o
 *   - aplicar `ALTER TABLE ... FORCE ROW LEVEL SECURITY` (afecta también al dueño).
 * Ambas opciones son un cambio de despliegue que debe hacerse junto con el patrón
 * transaccional por request; por eso esta migración deja RLS habilitado en modo
 * compatibilidad, sin impacto funcional inmediato.
 */
export class RowLevelSecurity1700000000003 implements MigrationInterface {
  name = 'RowLevelSecurity1700000000003';

  // Tablas con columna empresa_id sujetas a aislamiento por tenant.
  private readonly tenantTables = [
    'usuarios',
    'api_keys',
    'catalogo_items',
    'secuencias_ncf',
    'uso_mensual',
    'webhooks',
    'facturas_electronicas',
    'facturas_recibidas',
    'dispositivos',
    'auditoria',
    'contador_empresas',
    'contador_usuarios',
    'refresh_tokens',
  ];

  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const table of this.tenantTables) {
      // Habilitar RLS. No se usa FORCE para que el owner conserve acceso completo
      // (necesario para migraciones y mantenimiento).
      await queryRunner.query(`ALTER TABLE "${table}" ENABLE ROW LEVEL SECURITY`);

      // Política de aislamiento por tenant con modo compatibilidad.
      await queryRunner.query(`
        CREATE POLICY "tenant_isolation_${table}" ON "${table}"
        USING (
          current_setting('app.current_empresa', true) IS NULL
          OR current_setting('app.current_empresa', true) = ''
          OR empresa_id::text = current_setting('app.current_empresa', true)
        )
      `);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    for (const table of this.tenantTables) {
      await queryRunner.query(`DROP POLICY IF EXISTS "tenant_isolation_${table}" ON "${table}"`);
      await queryRunner.query(`ALTER TABLE "${table}" DISABLE ROW LEVEL SECURITY`);
    }
  }
}
