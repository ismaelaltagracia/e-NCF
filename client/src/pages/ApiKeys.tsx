import { useState, useEffect, useCallback, useRef } from 'react';
import Swal from 'sweetalert2';
import './ApiKeys.css';

/* ---------- Types ---------- */

interface ApiKey {
  id: string;
  nombre: string;
  scopes: string[];
  activo: boolean;
  last_used_at: string | null;
  created_at: string;
}

interface CreateFormData {
  nombre: string;
  scopes: string[];
}

/* ---------- Helpers ---------- */

function getAccessToken(): string {
  return localStorage.getItem('access_token') || '';
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return 'Nunca';
  return new Date(dateStr).toLocaleDateString('es-DO', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

const AVAILABLE_SCOPES = [
  { value: 'facturas:write', label: 'facturas:write' },
  { value: 'facturas:read', label: 'facturas:read' },
  { value: 'pdf:read', label: 'pdf:read' },
  { value: 'estado:read', label: 'estado:read' },
];

/* ---------- Main Component ---------- */

function ApiKeys() {
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [formData, setFormData] = useState<CreateFormData>({ nombre: '', scopes: [] });
  const [submitting, setSubmitting] = useState(false);
  const [revealedKeys, setRevealedKeys] = useState<Record<string, string>>({});
  const revealTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const [expandedId, setExpandedId] = useState<string | null>(null);

  /* ---------- Fetch ---------- */

  const fetchKeys = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/v1/api-keys', {
        headers: { Authorization: `Bearer ${getAccessToken()}` },
      });
      if (res.ok) {
        const data = await res.json();
        setKeys(Array.isArray(data) ? data : []);
      } else {
        const body = await res.json().catch(() => null);
        Swal.fire('Error', body?.message || 'No se pudieron cargar las API keys', 'error');
      }
    } catch {
      Swal.fire('Error', 'Error de conexión al cargar API keys', 'error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchKeys();
  }, [fetchKeys]);

  /* ---------- Cleanup reveal timers ---------- */

  useEffect(() => {
    return () => {
      Object.values(revealTimers.current).forEach(clearTimeout);
    };
  }, []);

  /* ---------- Reveal Key ---------- */

  const handleReveal = async (apiKey: ApiKey) => {
    try {
      const res = await fetch(`/api/v1/api-keys/${apiKey.id}/reveal`, {
        headers: { Authorization: `Bearer ${getAccessToken()}` },
      });

      if (res.ok) {
        const data = await res.json();
        setRevealedKeys((prev) => ({ ...prev, [apiKey.id]: data.key }));

        // Auto-hide after 30 seconds
        if (revealTimers.current[apiKey.id]) {
          clearTimeout(revealTimers.current[apiKey.id]);
        }
        revealTimers.current[apiKey.id] = setTimeout(() => {
          setRevealedKeys((prev) => {
            const next = { ...prev };
            delete next[apiKey.id];
            return next;
          });
          delete revealTimers.current[apiKey.id];
        }, 30000);
      } else {
        const body = await res.json().catch(() => null);
        Swal.fire('Error', body?.message || 'No se pudo revelar la key', 'error');
      }
    } catch {
      Swal.fire('Error', 'Error de conexión', 'error');
    }
  };

  /* ---------- Copy Key ---------- */

  const handleCopyKey = (key: string) => {
    navigator.clipboard.writeText(key);
    Swal.fire({ title: 'Copiada', text: 'Key copiada al portapapeles', icon: 'success', timer: 1500, showConfirmButton: false });
  };

  /* ---------- Create Key ---------- */

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.nombre.trim()) {
      Swal.fire('Error', 'El nombre es requerido', 'error');
      return;
    }

    if (formData.scopes.length === 0) {
      Swal.fire('Error', 'Debe seleccionar al menos un scope', 'error');
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch('/api/v1/api-keys', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${getAccessToken()}`,
        },
        body: JSON.stringify({
          nombre: formData.nombre.trim(),
          scopes: formData.scopes,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setShowCreateModal(false);
        setFormData({ nombre: '', scopes: [] });
        fetchKeys();

        // Show key only once
        Swal.fire({
          title: 'API Key Creada',
          html: `
            <div style="text-align: left; margin-top: 1rem;">
              <p style="color: #d93025; font-weight: 500; margin-bottom: 0.75rem;">
                ⚠️ La key solo se muestra una vez. Cópiela ahora.
              </p>
              <div style="background: #f8f9fa; padding: 0.75rem; border-radius: 6px; border: 1px solid #dadce0; word-break: break-all; font-family: monospace; font-size: 0.85rem;">
                ${data.key}
              </div>
            </div>
          `,
          icon: 'success',
          confirmButtonText: 'Copiar y Cerrar',
          showCancelButton: true,
          cancelButtonText: 'Cerrar',
          preConfirm: () => {
            navigator.clipboard.writeText(data.key);
          },
        });
      } else {
        const body = await res.json().catch(() => null);
        Swal.fire('Error', body?.message || 'No se pudo crear la API key', 'error');
      }
    } catch {
      Swal.fire('Error', 'Error de conexión', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  /* ---------- Rotate Key ---------- */

  const handleRotate = async (apiKey: ApiKey) => {
    const result = await Swal.fire({
      title: '¿Rotar API Key?',
      html: `Se generará una nueva key para <strong>${apiKey.nombre}</strong>.<br>La key anterior dejará de funcionar inmediatamente.`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#e37400',
      cancelButtonColor: '#5f6368',
      confirmButtonText: 'Rotar Key',
      cancelButtonText: 'Cancelar',
    });

    if (!result.isConfirmed) return;

    try {
      const res = await fetch(`/api/v1/api-keys/${apiKey.id}/rotate`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${getAccessToken()}` },
      });

      if (res.ok) {
        const data = await res.json();
        Swal.fire({
          title: 'Key Rotada',
          html: `
            <div style="text-align: left; margin-top: 1rem;">
              <p style="color: #d93025; font-weight: 500; margin-bottom: 0.75rem;">
                ⚠️ La key solo se muestra una vez. Cópiela ahora.
              </p>
              <div style="background: #f8f9fa; padding: 0.75rem; border-radius: 6px; border: 1px solid #dadce0; word-break: break-all; font-family: monospace; font-size: 0.85rem;">
                ${data.key}
              </div>
            </div>
          `,
          icon: 'success',
          confirmButtonText: 'Copiar y Cerrar',
          showCancelButton: true,
          cancelButtonText: 'Cerrar',
          preConfirm: () => {
            navigator.clipboard.writeText(data.key);
          },
        });
      } else {
        const body = await res.json().catch(() => null);
        Swal.fire('Error', body?.message || 'No se pudo rotar la key', 'error');
      }
    } catch {
      Swal.fire('Error', 'Error de conexión', 'error');
    }
  };

  /* ---------- Revoke Key ---------- */

  const handleRevoke = async (apiKey: ApiKey) => {
    const result = await Swal.fire({
      title: '¿Revocar API Key?',
      html: `Se revocará permanentemente la key <strong>${apiKey.nombre}</strong>.<br>Esta acción no se puede deshacer.`,
      icon: 'error',
      showCancelButton: true,
      confirmButtonColor: '#d93025',
      cancelButtonColor: '#5f6368',
      confirmButtonText: 'Revocar',
      cancelButtonText: 'Cancelar',
    });

    if (!result.isConfirmed) return;

    try {
      const res = await fetch(`/api/v1/api-keys/${apiKey.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${getAccessToken()}` },
      });

      if (res.ok) {
        Swal.fire({ title: 'Revocada', text: 'API Key revocada exitosamente', icon: 'success', timer: 2000, showConfirmButton: false });
        fetchKeys();
      } else {
        const body = await res.json().catch(() => null);
        Swal.fire('Error', body?.message || 'No se pudo revocar la key', 'error');
      }
    } catch {
      Swal.fire('Error', 'Error de conexión', 'error');
    }
  };

  /* ---------- Scope Toggle ---------- */

  const toggleScope = (scope: string) => {
    setFormData((prev) => ({
      ...prev,
      scopes: prev.scopes.includes(scope)
        ? prev.scopes.filter((s) => s !== scope)
        : [...prev.scopes, scope],
    }));
  };

  /* ---------- Render ---------- */

  return (
    <div className="apikeys">
      <div className="apikeys-header">
        <div>
          <h2>API Keys</h2>
          <p>Gestione las claves de integración para sistemas externos.</p>
        </div>
        <button
          type="button"
          className="apikeys-btn-primary"
          onClick={() => { setFormData({ nombre: '', scopes: [] }); setShowCreateModal(true); }}
        >
          + Crear API Key
        </button>
      </div>

      <div className="apikeys-warning">
        ⚠️ Las keys se almacenan encriptadas. Puede revelarlas usando el botón "Mostrar" (se ocultan automáticamente tras 30 segundos).
      </div>

      {/* Loading */}
      {loading && (
        <div className="apikeys-loading" role="status" aria-live="polite">
          <span className="apikeys-spinner" aria-hidden="true" />
          Cargando API keys...
        </div>
      )}

      {/* Empty */}
      {!loading && keys.length === 0 && (
        <div className="apikeys-empty">
          <p>No hay API keys configuradas.</p>
          <p>Cree una key para integrar sistemas externos con la API.</p>
        </div>
      )}

      {/* Table */}
      {!loading && keys.length > 0 && (
        <div className="apikeys-table-wrapper">
          <table className="apikeys-table" aria-label="Lista de API Keys">
            <thead>
              <tr>
                <th scope="col">Nombre</th>
                <th scope="col">Estado</th>
                <th scope="col">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {keys.map((apiKey) => (
                <>
                  <tr
                    key={apiKey.id}
                    className={`${!apiKey.activo ? 'apikeys-row-inactive' : ''} ${expandedId === apiKey.id ? 'apikeys-row-expanded' : ''}`}
                    onClick={() => setExpandedId(expandedId === apiKey.id ? null : apiKey.id)}
                    style={{ cursor: 'pointer' }}
                  >
                    <td className="apikeys-cell-name">{apiKey.nombre}</td>
                    <td>
                      <span className={`apikeys-badge ${apiKey.activo ? 'apikeys-badge-activo' : 'apikeys-badge-inactivo'}`}>
                        {apiKey.activo ? 'Activa' : 'Revocada'}
                      </span>
                    </td>
                    <td className="apikeys-cell-actions">
                      {apiKey.activo && (
                        <>
                          <button
                            type="button"
                            className="apikeys-btn-rotate"
                            onClick={(e) => { e.stopPropagation(); handleRotate(apiKey); }}
                            aria-label={`Rotar ${apiKey.nombre}`}
                          >
                            Rotar
                          </button>
                          <button
                            type="button"
                            className="apikeys-btn-revoke"
                            onClick={(e) => { e.stopPropagation(); handleRevoke(apiKey); }}
                            aria-label={`Revocar ${apiKey.nombre}`}
                          >
                            Revocar
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
                  {expandedId === apiKey.id && (
                    <tr key={`${apiKey.id}-detail`} className="apikeys-detail-row">
                      <td colSpan={3}>
                        <div className="apikeys-detail-panel">
                          {/* Key reveal */}
                          <div className="apikeys-detail-item">
                            <span className="apikeys-detail-label">Key</span>
                            <span className="apikeys-detail-value">
                              {revealedKeys[apiKey.id] ? (
                                <span className="apikeys-key-revealed">
                                  <code className="apikeys-key-value">{revealedKeys[apiKey.id]}</code>
                                  <button
                                    type="button"
                                    className="apikeys-btn-copy"
                                    onClick={(e) => { e.stopPropagation(); handleCopyKey(revealedKeys[apiKey.id]); }}
                                    aria-label={`Copiar key ${apiKey.nombre}`}
                                  >
                                    📋 Copiar
                                  </button>
                                </span>
                              ) : (
                                <span className="apikeys-key-hidden">
                                  <span className="apikeys-key-dots">••••••••••••••••</span>
                                  {apiKey.activo && (
                                    <button
                                      type="button"
                                      className="apikeys-btn-reveal"
                                      onClick={(e) => { e.stopPropagation(); handleReveal(apiKey); }}
                                      aria-label={`Mostrar key ${apiKey.nombre}`}
                                    >
                                      👁 Mostrar
                                    </button>
                                  )}
                                </span>
                              )}
                            </span>
                          </div>

                          {/* Scopes */}
                          <div className="apikeys-detail-item">
                            <span className="apikeys-detail-label">Scopes</span>
                            <span className="apikeys-detail-value apikeys-detail-scopes">
                              {apiKey.scopes.map((scope) => (
                                <span key={scope} className="apikeys-scope-chip">
                                  {scope}
                                </span>
                              ))}
                            </span>
                          </div>

                          {/* Último uso */}
                          <div className="apikeys-detail-item">
                            <span className="apikeys-detail-label">Último uso</span>
                            <span className="apikeys-detail-value">{formatDate(apiKey.last_used_at)}</span>
                          </div>

                          {/* Creada */}
                          <div className="apikeys-detail-item">
                            <span className="apikeys-detail-label">Creada</span>
                            <span className="apikeys-detail-value">{formatDate(apiKey.created_at)}</span>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Create Modal */}
      {showCreateModal && (
        <div className="apikeys-modal-overlay" role="dialog" aria-modal="true" aria-labelledby="apikeys-create-title">
          <div className="apikeys-modal">
            <div className="apikeys-modal-header">
              <h3 id="apikeys-create-title">Crear API Key</h3>
              <button type="button" className="apikeys-modal-close" onClick={() => setShowCreateModal(false)} aria-label="Cerrar">✕</button>
            </div>
            <form className="apikeys-form" onSubmit={handleCreate} noValidate>
              <div className="apikeys-form-field">
                <label htmlFor="apikey-nombre">Nombre *</label>
                <input
                  id="apikey-nombre"
                  type="text"
                  value={formData.nombre}
                  onChange={(e) => setFormData({ ...formData, nombre: e.target.value })}
                  placeholder="Ej: Integración ERP"
                />
              </div>
              <div className="apikeys-form-field">
                <label>Scopes *</label>
                <div className="apikeys-scopes-grid">
                  {AVAILABLE_SCOPES.map((scope) => (
                    <label key={scope.value} className="apikeys-scope-checkbox">
                      <input
                        type="checkbox"
                        checked={formData.scopes.includes(scope.value)}
                        onChange={() => toggleScope(scope.value)}
                      />
                      <span className="apikeys-scope-label">{scope.label}</span>
                    </label>
                  ))}
                </div>
              </div>
              <div className="apikeys-form-actions">
                <button type="button" className="apikeys-btn-cancel" onClick={() => setShowCreateModal(false)} disabled={submitting}>
                  Cancelar
                </button>
                <button type="submit" className="apikeys-btn-primary" disabled={submitting}>
                  {submitting ? 'Creando...' : 'Crear API Key'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default ApiKeys;
