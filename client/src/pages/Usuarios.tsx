import { useState, useEffect, useCallback } from 'react';
import Swal from 'sweetalert2';
import './Usuarios.css';

/* ---------- Types ---------- */

interface Usuario {
  id: string;
  nombre: string;
  email: string;
  rol: 'admin' | 'facturador' | 'lector';
  activo: boolean;
  created_at: string;
}

interface CreateFormData {
  nombre: string;
  email: string;
  password: string;
  rol: 'admin' | 'facturador' | 'lector';
}

/* ---------- Helpers ---------- */

function getAccessToken(): string {
  return localStorage.getItem('access_token') || '';
}

function getUserRole(): string | null {
  const token = getAccessToken();
  if (!token) return null;
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    return payload.rol || payload.role || null;
  } catch {
    return null;
  }
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('es-DO', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

const EMPTY_FORM: CreateFormData = {
  nombre: '',
  email: '',
  password: '',
  rol: 'facturador',
};

/* ---------- Main Component ---------- */

function Usuarios() {
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingUser, setEditingUser] = useState<Usuario | null>(null);
  const [editRol, setEditRol] = useState<'admin' | 'facturador' | 'lector'>('facturador');
  const [formData, setFormData] = useState<CreateFormData>(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);

  const currentRole = getUserRole();
  const isAdmin = currentRole === 'admin';

  /* ---------- Fetch ---------- */

  const fetchUsuarios = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/v1/usuarios', {
        headers: { Authorization: `Bearer ${getAccessToken()}` },
      });
      if (res.ok) {
        const data = await res.json();
        const mapped = (Array.isArray(data) ? data : []).map((u: any) => ({
          ...u,
          id: u.usuario_id || u.id,
        })) as Usuario[];
        setUsuarios(mapped);
      } else {
        const body = await res.json().catch(() => null);
        Swal.fire('Error', body?.message || 'No se pudieron cargar los usuarios', 'error');
      }
    } catch {
      Swal.fire('Error', 'Error de conexión al cargar usuarios', 'error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchUsuarios();
  }, [fetchUsuarios]);

  /* ---------- Access Control ---------- */

  if (!isAdmin) {
    return (
      <div className="usuarios">
        <div className="usuarios-access-denied">
          <h2>Acceso Denegado</h2>
          <p>Solo los administradores pueden gestionar usuarios.</p>
        </div>
      </div>
    );
  }

  /* ---------- Create User ---------- */

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.nombre.trim() || !formData.email.trim() || !formData.password.trim()) {
      Swal.fire('Error', 'Todos los campos son requeridos', 'error');
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch('/api/v1/usuarios', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${getAccessToken()}`,
        },
        body: JSON.stringify({
          nombre: formData.nombre.trim(),
          email: formData.email.trim(),
          password: formData.password,
          rol: formData.rol,
        }),
      });

      if (res.ok) {
        setShowCreateModal(false);
        setFormData(EMPTY_FORM);
        Swal.fire({ title: 'Creado', text: 'Usuario creado exitosamente', icon: 'success', timer: 2000, showConfirmButton: false });
        fetchUsuarios();
      } else {
        const body = await res.json().catch(() => null);
        Swal.fire('Error', body?.message || 'No se pudo crear el usuario', 'error');
      }
    } catch {
      Swal.fire('Error', 'Error de conexión', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  /* ---------- Edit Role ---------- */

  const openEditModal = (user: Usuario) => {
    setEditingUser(user);
    setEditRol(user.rol);
    setShowEditModal(true);
  };

  const handleEditRole = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser) return;

    setSubmitting(true);
    try {
      const res = await fetch(`/api/v1/usuarios/${editingUser.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${getAccessToken()}`,
        },
        body: JSON.stringify({ rol: editRol }),
      });

      if (res.ok) {
        setShowEditModal(false);
        setEditingUser(null);
        Swal.fire({ title: 'Actualizado', text: 'Rol actualizado exitosamente', icon: 'success', timer: 2000, showConfirmButton: false });
        fetchUsuarios();
      } else {
        const body = await res.json().catch(() => null);
        Swal.fire('Error', body?.message || 'No se pudo actualizar el rol', 'error');
      }
    } catch {
      Swal.fire('Error', 'Error de conexión', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  /* ---------- Toggle Active ---------- */

  const handleToggleActive = async (user: Usuario) => {
    const action = user.activo ? 'desactivar' : 'activar';
    const result = await Swal.fire({
      title: `¿${user.activo ? 'Desactivar' : 'Activar'} usuario?`,
      html: `Se va a ${action} al usuario <strong>${user.nombre}</strong> (${user.email}).`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: user.activo ? '#d93025' : '#1e8e3e',
      cancelButtonColor: '#5f6368',
      confirmButtonText: user.activo ? 'Desactivar' : 'Activar',
      cancelButtonText: 'Cancelar',
    });

    if (!result.isConfirmed) return;

    try {
      const res = await fetch(`/api/v1/usuarios/${user.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${getAccessToken()}`,
        },
        body: JSON.stringify({ activo: !user.activo }),
      });

      if (res.ok) {
        Swal.fire({ title: user.activo ? 'Desactivado' : 'Activado', text: `Usuario ${action}do exitosamente`, icon: 'success', timer: 2000, showConfirmButton: false });
        fetchUsuarios();
      } else {
        const body = await res.json().catch(() => null);
        Swal.fire('Error', body?.message || `No se pudo ${action} el usuario`, 'error');
      }
    } catch {
      Swal.fire('Error', 'Error de conexión', 'error');
    }
  };

  /* ---------- Render ---------- */

  return (
    <div className="usuarios">
      <div className="usuarios-header">
        <div>
          <h2>Gestión de Usuarios</h2>
          <p>Administre los usuarios de su empresa.</p>
        </div>
        <button
          type="button"
          className="usuarios-btn-primary"
          onClick={() => { setFormData(EMPTY_FORM); setShowCreateModal(true); }}
        >
          + Crear Usuario
        </button>
      </div>

      {/* Loading */}
      {loading && (
        <div className="usuarios-loading" role="status" aria-live="polite">
          <span className="usuarios-spinner" aria-hidden="true" />
          Cargando usuarios...
        </div>
      )}

      {/* Empty state */}
      {!loading && usuarios.length === 0 && (
        <div className="usuarios-empty">
          <p>No hay usuarios registrados.</p>
        </div>
      )}

      {/* Table */}
      {!loading && usuarios.length > 0 && (
        <div className="usuarios-table-wrapper">
          <table className="usuarios-table" aria-label="Lista de usuarios">
            <thead>
              <tr>
                <th scope="col">Nombre</th>
                <th scope="col">Email</th>
                <th scope="col">Rol</th>
                <th scope="col">Estado</th>
                <th scope="col">Creado</th>
                <th scope="col">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {usuarios.map((user) => (
                <tr key={user.id} className={!user.activo ? 'usuarios-row-inactive' : ''}>
                  <td className="usuarios-cell-name">{user.nombre}</td>
                  <td className="usuarios-cell-email">{user.email}</td>
                  <td>
                    <span className={`usuarios-badge usuarios-badge-${user.rol}`}>
                      {user.rol}
                    </span>
                  </td>
                  <td>
                    <span className={`usuarios-badge ${user.activo ? 'usuarios-badge-activo' : 'usuarios-badge-inactivo'}`}>
                      {user.activo ? 'Activo' : 'Inactivo'}
                    </span>
                  </td>
                  <td className="usuarios-cell-date">{formatDate(user.created_at)}</td>
                  <td className="usuarios-cell-actions">
                    <button
                      type="button"
                      className="usuarios-btn-edit"
                      onClick={() => openEditModal(user)}
                      aria-label={`Editar rol de ${user.nombre}`}
                    >
                      Editar
                    </button>
                    <button
                      type="button"
                      className={user.activo ? 'usuarios-btn-deactivate' : 'usuarios-btn-activate'}
                      onClick={() => handleToggleActive(user)}
                      aria-label={`${user.activo ? 'Desactivar' : 'Activar'} ${user.nombre}`}
                    >
                      {user.activo ? 'Desactivar' : 'Activar'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Create Modal */}
      {showCreateModal && (
        <div className="usuarios-modal-overlay" role="dialog" aria-modal="true" aria-labelledby="usuarios-create-title">
          <div className="usuarios-modal">
            <div className="usuarios-modal-header">
              <h3 id="usuarios-create-title">Crear Usuario</h3>
              <button type="button" className="usuarios-modal-close" onClick={() => setShowCreateModal(false)} aria-label="Cerrar">✕</button>
            </div>
            <form className="usuarios-form" onSubmit={handleCreate} noValidate>
              <div className="usuarios-form-field">
                <label htmlFor="usuario-nombre">Nombre *</label>
                <input
                  id="usuario-nombre"
                  type="text"
                  value={formData.nombre}
                  onChange={(e) => setFormData({ ...formData, nombre: e.target.value })}
                  placeholder="Nombre completo"
                />
              </div>
              <div className="usuarios-form-field">
                <label htmlFor="usuario-email">Email *</label>
                <input
                  id="usuario-email"
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  placeholder="correo@ejemplo.com"
                />
              </div>
              <div className="usuarios-form-field">
                <label htmlFor="usuario-password">Contraseña *</label>
                <input
                  id="usuario-password"
                  type="password"
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  placeholder="Mínimo 8 caracteres"
                />
              </div>
              <div className="usuarios-form-field">
                <label htmlFor="usuario-rol">Rol *</label>
                <select
                  id="usuario-rol"
                  value={formData.rol}
                  onChange={(e) => setFormData({ ...formData, rol: e.target.value as 'admin' | 'facturador' | 'lector' })}
                >
                  <option value="admin">Admin</option>
                  <option value="facturador">Facturador</option>
                  <option value="lector">Lector</option>
                </select>
              </div>
              <div className="usuarios-form-actions">
                <button type="button" className="usuarios-btn-cancel" onClick={() => setShowCreateModal(false)} disabled={submitting}>
                  Cancelar
                </button>
                <button type="submit" className="usuarios-btn-primary" disabled={submitting}>
                  {submitting ? 'Creando...' : 'Crear Usuario'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Role Modal */}
      {showEditModal && editingUser && (
        <div className="usuarios-modal-overlay" role="dialog" aria-modal="true" aria-labelledby="usuarios-edit-title">
          <div className="usuarios-modal">
            <div className="usuarios-modal-header">
              <h3 id="usuarios-edit-title">Editar Rol</h3>
              <button type="button" className="usuarios-modal-close" onClick={() => { setShowEditModal(false); setEditingUser(null); }} aria-label="Cerrar">✕</button>
            </div>
            <form className="usuarios-form" onSubmit={handleEditRole} noValidate>
              <div className="usuarios-form-field">
                <label>Usuario</label>
                <p className="usuarios-form-static">{editingUser.nombre} ({editingUser.email})</p>
              </div>
              <div className="usuarios-form-field">
                <label htmlFor="usuario-edit-rol">Nuevo Rol *</label>
                <select
                  id="usuario-edit-rol"
                  value={editRol}
                  onChange={(e) => setEditRol(e.target.value as 'admin' | 'facturador' | 'lector')}
                >
                  <option value="admin">Admin</option>
                  <option value="facturador">Facturador</option>
                  <option value="lector">Lector</option>
                </select>
              </div>
              <div className="usuarios-form-actions">
                <button type="button" className="usuarios-btn-cancel" onClick={() => { setShowEditModal(false); setEditingUser(null); }} disabled={submitting}>
                  Cancelar
                </button>
                <button type="submit" className="usuarios-btn-primary" disabled={submitting}>
                  {submitting ? 'Guardando...' : 'Guardar Cambios'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default Usuarios;
