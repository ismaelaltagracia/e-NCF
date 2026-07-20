import { useState, useEffect, useCallback } from 'react';
import Swal from 'sweetalert2';
import { useAuth } from '../../context/AuthContext';
import './AdminAuditoria.css';

interface AuditoriaEntry {
  id: string;
  empresa_id: string | null;
  usuario_id: string | null;
  accion: string;
  recurso_tipo: string;
  recurso_id: string | null;
  ip_origen: string | null;
  created_at: string;
  empresa_nombre?: string;
  usuario_nombre?: string;
}

function formatDateTime(dateStr: string): string {
  return new Date(dateStr).toLocaleString('es-DO', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function AdminAuditoria() {
  const { authFetch } = useAuth();
  const [entries, setEntries] = useState<AuditoriaEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchAuditoria = useCallback(async () => {
    setLoading(true);
    try {
      const res = await authFetch('/api/v1/admin/auditoria');
      if (res.ok) {
        const data = await res.json();
        setEntries(Array.isArray(data) ? data : []);
      } else {
        const body = await res.json().catch(() => null);
        Swal.fire('Error', body?.message || 'No se pudo cargar la auditoría', 'error');
      }
    } catch {
      Swal.fire('Error', 'Error de conexión al cargar auditoría', 'error');
    } finally {
      setLoading(false);
    }
  }, [authFetch]);

  useEffect(() => {
    fetchAuditoria();
  }, [fetchAuditoria]);

  return (
    <div className="admin-auditoria">
      <div className="admin-auditoria-header">
        <div>
          <h2>Registro de Auditoría</h2>
          <p>Historial de acciones del sistema.</p>
        </div>
        {!loading && (
          <span className="admin-auditoria-count">
            {entries.length} registro{entries.length !== 1 ? 's' : ''}
          </span>
        )}
      </div>

      {loading && (
        <div className="admin-auditoria-loading" role="status" aria-live="polite">
          <span className="admin-auditoria-spinner" aria-hidden="true" />
          Cargando auditoría...
        </div>
      )}

      {!loading && entries.length === 0 && (
        <div className="admin-auditoria-empty">
          <p>No hay registros de auditoría.</p>
        </div>
      )}

      {!loading && entries.length > 0 && (
        <div className="admin-auditoria-table-wrapper">
          <table className="admin-auditoria-table" aria-label="Registro de auditoría">
            <thead>
              <tr>
                <th scope="col">Fecha</th>
                <th scope="col">Acción</th>
                <th scope="col">Recurso</th>
                <th scope="col">Empresa</th>
                <th scope="col">Usuario</th>
                <th scope="col">IP</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => (
                <tr key={entry.id}>
                  <td className="admin-auditoria-cell-date">{formatDateTime(entry.created_at)}</td>
                  <td>
                    <span className="admin-auditoria-badge-accion">{entry.accion}</span>
                  </td>
                  <td className="admin-auditoria-cell-recurso">
                    {entry.recurso_tipo}
                    {entry.recurso_id && (
                      <span className="admin-auditoria-recurso-id">{entry.recurso_id.slice(0, 8)}…</span>
                    )}
                  </td>
                  <td className="admin-auditoria-cell-empresa">
                    {entry.empresa_nombre || entry.empresa_id?.slice(0, 8) || '—'}
                  </td>
                  <td className="admin-auditoria-cell-usuario">
                    {entry.usuario_nombre || entry.usuario_id?.slice(0, 8) || '—'}
                  </td>
                  <td className="admin-auditoria-cell-ip">{entry.ip_origen || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default AdminAuditoria;
