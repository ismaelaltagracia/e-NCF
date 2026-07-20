import { useState, useEffect, useCallback } from 'react';
import Swal from 'sweetalert2';
import { useAuth } from '../../context/AuthContext';
import './AdminPlanes.css';

interface Plan {
  id: string;
  nombre: string;
  precio: string;
  limite_facturas_mensual: number | null;
  activo: boolean;
}

function AdminPlanes() {
  const { authFetch } = useAuth();
  const [planes, setPlanes] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Plan | null>(null);
  const [form, setForm] = useState({ nombre: '', precio: '', limite: '', activo: true, permite_api: false });
  const [submitting, setSubmitting] = useState(false);

  const fetchPlanes = useCallback(async () => {
    setLoading(true);
    try {
      const res = await authFetch('/api/v1/admin/planes');
      if (res.ok) {
        const data = await res.json();
        setPlanes(Array.isArray(data) ? data : []);
      }
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, [authFetch]);

  useEffect(() => { fetchPlanes(); }, [fetchPlanes]);

  const openCreate = () => {
    setEditing(null);
    setForm({ nombre: '', precio: '', limite: '', activo: true, permite_api: false });
    setShowModal(true);
  };

  const openEdit = (plan: Plan) => {
    setEditing(plan);
    setForm({
      nombre: plan.nombre,
      precio: String(plan.precio),
      limite: plan.limite_facturas_mensual !== null ? String(plan.limite_facturas_mensual) : '',
      activo: plan.activo,
      permite_api: (plan as any).permite_api ?? false,
    });
    setShowModal(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.nombre.trim() || !form.precio.trim()) {
      Swal.fire('Error', 'Nombre y precio son requeridos', 'error');
      return;
    }
    setSubmitting(true);
    try {
      const body = {
        nombre: form.nombre.trim(),
        precio: parseFloat(form.precio),
        limite_facturas_mensual: form.limite ? parseInt(form.limite) : null,
        activo: form.activo,
        permite_api: form.permite_api,
      };

      const url = editing ? `/api/v1/admin/planes/${editing.id}` : '/api/v1/admin/planes';
      const method = editing ? 'PATCH' : 'POST';

      const res = await authFetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (res.ok) {
        Swal.fire({ title: editing ? 'Actualizado' : 'Creado', icon: 'success', timer: 2000, showConfirmButton: false });
        setShowModal(false);
        fetchPlanes();
      } else {
        const data = await res.json().catch(() => null);
        Swal.fire('Error', data?.message || 'No se pudo guardar', 'error');
      }
    } catch {
      Swal.fire('Error', 'Error de conexión', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="admin-planes">
      <div className="admin-planes-header">
        <div>
          <h2>Planes del Sistema</h2>
          <p>Gestione los planes de suscripción.</p>
        </div>
        <button className="admin-planes-btn-primary" onClick={openCreate}>+ Crear Plan</button>
      </div>

      {loading ? <p>Cargando...</p> : planes.length === 0 ? <p>No hay planes.</p> : (
        <div className="admin-planes-table-wrapper">
          <table className="admin-planes-table">
            <thead>
              <tr><th>Nombre</th><th>Precio</th><th>Límite Facturas/Mes</th><th>Estado</th><th>Acciones</th></tr>
            </thead>
            <tbody>
              {planes.map((plan) => (
                <tr key={plan.id}>
                  <td className="admin-planes-cell-name">{plan.nombre}</td>
                  <td>RD$ {Number(plan.precio).toLocaleString('es-DO', { minimumFractionDigits: 2 })}</td>
                  <td>{plan.limite_facturas_mensual !== null ? plan.limite_facturas_mensual.toLocaleString() : 'Ilimitado'}</td>
                  <td><span className={`admin-planes-badge ${plan.activo ? 'admin-planes-badge-activo' : 'admin-planes-badge-inactivo'}`}>{plan.activo ? 'Activo' : 'Inactivo'}</span></td>
                  <td><button className="admin-planes-btn-edit" onClick={() => openEdit(plan)}>Editar</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showModal && (
        <div className="admin-planes-modal-overlay" onClick={() => setShowModal(false)}>
          <div className="admin-planes-modal" onClick={(e) => e.stopPropagation()}>
            <h3>{editing ? 'Editar Plan' : 'Crear Plan'}</h3>
            <form onSubmit={handleSubmit}>
              <div className="admin-planes-form-field">
                <label>Nombre</label>
                <input type="text" value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} />
              </div>
              <div className="admin-planes-form-field">
                <label>Precio Mensual (DOP)</label>
                <input type="number" step="0.01" min="0" value={form.precio} onChange={(e) => setForm({ ...form, precio: e.target.value })} />
              </div>
              <div className="admin-planes-form-field">
                <label>Límite Facturas/Mes (vacío = ilimitado)</label>
                <input type="number" min="0" value={form.limite} onChange={(e) => setForm({ ...form, limite: e.target.value })} placeholder="Ilimitado" />
              </div>
              {editing && (
                <div className="admin-planes-form-field">
                  <label><input type="checkbox" checked={form.activo} onChange={(e) => setForm({ ...form, activo: e.target.checked })} /> Activo</label>
                </div>
              )}
              <div className="admin-planes-form-field">
                <label><input type="checkbox" checked={form.permite_api} onChange={(e) => setForm({ ...form, permite_api: e.target.checked })} /> Permite integración API</label>
              </div>
              <div className="admin-planes-form-actions">
                <button type="button" onClick={() => setShowModal(false)}>Cancelar</button>
                <button type="submit" className="admin-planes-btn-primary" disabled={submitting}>
                  {submitting ? 'Guardando...' : editing ? 'Guardar' : 'Crear'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default AdminPlanes;
