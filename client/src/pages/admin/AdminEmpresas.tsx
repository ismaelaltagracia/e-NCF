import { useState, useEffect, useCallback } from 'react';
import Swal from 'sweetalert2';
import { useAuth } from '../../context/AuthContext';
import './AdminEmpresas.css';

interface Empresa {
  id: string;
  nombre: string;
  rnc: string;
  estado: string;
  ambiente_dgii: string;
  plan_id: string | null;
  plan_nombre?: string;
  created_at: string;
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('es-DO', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function AdminEmpresas() {
  const { authFetch } = useAuth();
  const [empresas, setEmpresas] = useState<Empresa[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchEmpresas = useCallback(async () => {
    setLoading(true);
    try {
      const res = await authFetch('/api/v1/admin/empresas');
      if (res.ok) {
        const data = await res.json();
        setEmpresas(Array.isArray(data) ? data : []);
      } else {
        const body = await res.json().catch(() => null);
        Swal.fire('Error', body?.message || 'No se pudieron cargar las empresas', 'error');
      }
    } catch {
      Swal.fire('Error', 'Error de conexión al cargar empresas', 'error');
    } finally {
      setLoading(false);
    }
  }, [authFetch]);

  useEffect(() => {
    fetchEmpresas();
  }, [fetchEmpresas]);

  const handlePromover = async (empresa: Empresa) => {
    const result = await Swal.fire({
      title: '¿Promover a Producción?',
      html: `Se promoverá <strong>${empresa.nombre}</strong> (RNC: ${empresa.rnc}) al ambiente de producción.<br/><br/>Las secuencias NCF de certificación serán desactivadas.`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#1e8e3e',
      cancelButtonColor: '#5f6368',
      confirmButtonText: 'Sí, promover',
      cancelButtonText: 'Cancelar',
    });

    if (!result.isConfirmed) return;

    try {
      const res = await authFetch(`/api/v1/admin/empresas/${empresa.id}/promover`, {
        method: 'PATCH',
      });

      if (res.ok) {
        Swal.fire({
          title: 'Promovida',
          text: `${empresa.nombre} ahora está en producción`,
          icon: 'success',
          timer: 2500,
          showConfirmButton: false,
        });
        fetchEmpresas();
      } else {
        const body = await res.json().catch(() => null);
        Swal.fire('Error', body?.message || 'No se pudo promover la empresa', 'error');
      }
    } catch {
      Swal.fire('Error', 'Error de conexión', 'error');
    }
  };

  return (
    <div className="admin-empresas">
      <div className="admin-empresas-header">
        <div>
          <h2>Empresas del Sistema</h2>
          <p>Gestione todas las empresas registradas.</p>
        </div>
        {!loading && (
          <span className="admin-empresas-count">
            {empresas.length} empresa{empresas.length !== 1 ? 's' : ''}
          </span>
        )}
      </div>

      {loading && (
        <div className="admin-empresas-loading" role="status" aria-live="polite">
          <span className="admin-empresas-spinner" aria-hidden="true" />
          Cargando empresas...
        </div>
      )}

      {!loading && empresas.length === 0 && (
        <div className="admin-empresas-empty">
          <p>No hay empresas registradas en el sistema.</p>
        </div>
      )}

      {!loading && empresas.length > 0 && (
        <div className="admin-empresas-table-wrapper">
          <table className="admin-empresas-table" aria-label="Lista de empresas">
            <thead>
              <tr>
                <th scope="col">Nombre</th>
                <th scope="col">RNC</th>
                <th scope="col">Estado</th>
                <th scope="col">Ambiente</th>
                <th scope="col">Plan</th>
                <th scope="col">Creada</th>
                <th scope="col">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {empresas.map((empresa) => (
                <tr key={empresa.id}>
                  <td className="admin-empresas-cell-name">{empresa.nombre}</td>
                  <td className="admin-empresas-cell-rnc">{empresa.rnc}</td>
                  <td>
                    <span className={`admin-empresas-badge admin-empresas-badge-${empresa.estado}`}>
                      {empresa.estado}
                    </span>
                  </td>
                  <td>
                    <span className={`admin-empresas-badge-ambiente admin-empresas-badge-ambiente-${empresa.ambiente_dgii}`}>
                      {empresa.ambiente_dgii === 'produccion' ? '🟢 Producción' : '🟡 Certificación'}
                    </span>
                  </td>
                  <td className="admin-empresas-cell-plan">
                    {empresa.plan_nombre || empresa.plan_id || '—'}
                  </td>
                  <td className="admin-empresas-cell-date">{formatDate(empresa.created_at)}</td>
                  <td className="admin-empresas-cell-actions">
                    {empresa.ambiente_dgii === 'certificacion' && (
                      <button
                        type="button"
                        className="admin-empresas-btn-promover"
                        onClick={() => handlePromover(empresa)}
                        aria-label={`Promover ${empresa.nombre} a producción`}
                      >
                        Promover
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default AdminEmpresas;
