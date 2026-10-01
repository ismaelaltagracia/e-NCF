import { Injectable } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';

/**
 * Servicio de contexto de tenant para Row-Level Security (RLS).
 *
 * Ejecuta una operación dentro de una transacción con `SET LOCAL app.current_empresa`,
 * de modo que las políticas RLS de PostgreSQL filtren automáticamente por empresa.
 * El uso de SET LOCAL garantiza que la variable solo viva dentro de la transacción
 * y no se filtre a otras requests que reutilicen la misma conexión del pool.
 *
 * Nota: para que RLS actúe como defensa estricta, las consultas de la operación
 * deben ejecutarse con el `EntityManager` transaccional que provee este helper.
 */
@Injectable()
export class TenantContextService {
  constructor(private readonly dataSource: DataSource) {}

  /**
   * Ejecuta `work` dentro de una transacción con el tenant fijado en la sesión.
   *
   * @param empresaId UUID de la empresa (tenant) activa.
   * @param work callback que recibe el EntityManager transaccional.
   */
  async runWithTenant<T>(
    empresaId: string,
    work: (manager: EntityManager) => Promise<T>,
  ): Promise<T> {
    return this.dataSource.transaction(async (manager) => {
      // set_config con is_local=true equivale a SET LOCAL: la variable se limpia
      // al terminar la transacción. Se parametriza el valor para evitar inyección.
      await manager.query('SELECT set_config($1, $2, true)', [
        'app.current_empresa',
        empresaId,
      ]);
      return work(manager);
    });
  }
}
