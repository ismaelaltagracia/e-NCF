import { useState, useEffect, useCallback } from 'react';
import Swal from 'sweetalert2';
import './SecuenciasNcf.css';

interface Secuencia {
  id: string;
  tipo_comprobante: string;
  prefijo: string;
  numero_inicio: number;
  numero_fin: number;
  numero_actual: number;
  activo: boolean;
}

const TIPOS_COMPROBANTE = [
  { value: 'E31', label: 'E31 - Factura de Crédito Fiscal' },
  { value: 'E32', label: 'E32 - Factura de Consumo' },
  { value: 'E33', label: 'E33 - Nota de Débito' },
  { value: 'E34', label: 'E34 - Nota de Crédito' },
  { value: 'E41', label: 'E41 - Compras' },
  { value: 'E43', label: 'E43 - Gastos Menores' },
  { value: 'E44', label: 'E44 - Regímenes Especiales' },
  { value: 'E45', label: 'E45 - Gubernamental' },
  { value: 'E46', label: 'E46 - Exportaciones' },
];

function getAccessToken(): string {
  return localStorage.getItem('access_token') || '';
}

function SecuenciasNcf() {
  const [secuencias, setSecuencias] = useState<Secuencia[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingSecuencia, setEditingSecuencia] = useState<Secuencia | null>(null);

  const fetchSecuencias = useCallback(async () => {
    try {
      const res = await fetch('/api/v1/secuencias-ncf', {
        headers: { Authorization: `Bearer ${getAccessToken()}` },
      });
      if (res.ok) {
        const data = await res.json();
        setSecuencias(Array.isArray(data) ? data : []);
      }
    } catch {
      Swal.fire('Error', 'No se pudieron cargar las secuencias', 'error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSecuencias();
  }, [fetchSecuencias]);

  const handleDesactivar = async (secuencia: Secuencia) => {
    const result = await Swal.fire({
      title: '¿Desactivar secuencia?',
      html: `Se desactivará la secuencia <strong>${secuencia.tipo_comprobante}</strong> (prefijo: ${secuencia.prefijo}).<br>No se podrán asignar más números de esta secuencia.`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#d93025',
      cancelButtonColor: '#5f6368',
      confirmButtonText: 'Desactivar',
      cancelButtonText: 'Cancelar',
    });

    if (result.isConfirmed) {
      try {
        const res = await fetch(`/api/v1/secuencias-ncf/${secuencia.id}`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${getAccessToken()}`,
          },
          body: JSON.stringify({ activo: false }),
        });
        if (res.ok) {
          Swal.fire('Desactivada', 'La secuencia ha sido desactivada', 'success');
          fetchSecuencias();
        } else {
          const body = await res.json();
          Swal.fire('Error', body.message || 'No se pudo desactivar', 'error');
        }
      } catch {
        Swal.fire('Error', 'Error de conexión', 'error');
      }
    }
  };

  const handleEditar = (secuencia: Secuencia) => {
    setEditingSecuencia(secuencia);
    setShowModal(true);
  };

  const handleNueva = () => {
    setEditingSecuencia(null);
    setShowModal(true);
  };

  const getUsagePercent = (s: Secuencia): number => {
    const total = Number(s.numero_fin) - Number(s.numero_inicio) + 1;
    const used = Number(s.numero_actual) - Number(s.numero_inicio);
    return Math.round((used / total) * 100);
  };

  const getUsageBadge = (percent: number) => {
    if (percent >= 90) return 'danger';
    if (percent >= 70) return 'warning';
    return 'active';
  };

  return (
    <div className="secuencias">
      <div className="secuencias-header">
        <h2>Secuencias de Comprobantes</h2>
        <button className="secuencias-btn-add" onClick={handleNueva}>
          + Nueva Secuencia
        </button>
      </div>

      {loading ? (
        <p>Cargando...</p>
      ) : secuencias.length === 0 ? (
        <div className="secuencias-empty">
          <p>No hay secuencias de comprobantes configuradas.</p>
          <p>Debe crear al menos una secuencia antes de poder emitir facturas.</p>
        </div>
      ) : (
        <table className="secuencias-table">
          <thead>
            <tr>
              <th>Tipo</th>
              <th>Prefijo</th>
              <th>Rango</th>
              <th>Actual</th>
              <th>Uso</th>
              <th>Estado</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {secuencias.map((s) => {
              const percent = getUsagePercent(s);
              const badge = getUsageBadge(percent);
              return (
                <tr key={s.id}>
                  <td>{s.tipo_comprobante}</td>
                  <td><code>{s.prefijo}</code></td>
                  <td>{Number(s.numero_inicio).toLocaleString()} — {Number(s.numero_fin).toLocaleString()}</td>
                  <td>{Number(s.numero_actual).toLocaleString()}</td>
                  <td>
                    <div className="secuencias-progress">
                      <div
                        className="secuencias-progress-bar"
                        style={{
                          width: `${percent}%`,
                          backgroundColor: badge === 'danger' ? '#d93025' : badge === 'warning' ? '#e37400' : '#1e8e3e',
                        }}
                      />
                    </div>
                    <span style={{ fontSize: '0.75rem', color: '#5f6368' }}>{percent}%</span>
                  </td>
                  <td>
                    <span className={`secuencias-badge ${s.activo ? 'active' : 'danger'}`}>
                      {s.activo ? 'Activa' : 'Inactiva'}
                    </span>
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      <button
                        onClick={() => handleEditar(s)}
                        style={{ padding: '0.3rem 0.6rem', fontSize: '0.75rem', background: '#1a73e8', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
                      >
                        Editar
                      </button>
                      {s.activo && (
                        <button
                          onClick={() => handleDesactivar(s)}
                          style={{ padding: '0.3rem 0.6rem', fontSize: '0.75rem', background: '#d93025', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
                        >
                          Desactivar
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      {showModal && (
        <SecuenciaModal
          secuencia={editingSecuencia}
          onClose={() => { setShowModal(false); setEditingSecuencia(null); }}
          onSaved={() => {
            setShowModal(false);
            setEditingSecuencia(null);
            fetchSecuencias();
          }}
        />
      )}
    </div>
  );
}

function SecuenciaModal({ secuencia, onClose, onSaved }: { secuencia: Secuencia | null; onClose: () => void; onSaved: () => void }) {
  const isEditing = !!secuencia;
  const [tipo, setTipo] = useState(secuencia?.tipo_comprobante || 'E31');
  const [prefijo, setPrefijo] = useState(secuencia?.prefijo || 'E31');
  const [inicio, setInicio] = useState(String(secuencia?.numero_inicio || '1'));
  const [fin, setFin] = useState(String(secuencia?.numero_fin || '99999999'));
  const [actual, setActual] = useState(String(secuencia?.numero_actual || '1'));
  const [submitting, setSubmitting] = useState(false);

  const handleTipoChange = (value: string) => {
    setTipo(value);
    if (!isEditing) setPrefijo(value);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);

    try {
      const url = isEditing
        ? `/api/v1/secuencias-ncf/${secuencia!.id}`
        : '/api/v1/secuencias-ncf';

      const method = isEditing ? 'PATCH' : 'POST';

      const body = isEditing
        ? { prefijo, numero_fin: parseInt(fin), numero_actual: parseInt(actual), activo: true }
        : { tipo_comprobante: tipo, prefijo, numero_inicio: parseInt(inicio), numero_fin: parseInt(fin), numero_actual: parseInt(inicio) };

      const res = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${getAccessToken()}`,
        },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const data = await res.json();
        Swal.fire('Error', data.message || 'No se pudo guardar la secuencia', 'error');
        return;
      }

      Swal.fire({
        title: isEditing ? 'Actualizada' : 'Creada',
        text: isEditing ? 'Secuencia actualizada exitosamente' : 'Secuencia creada exitosamente',
        icon: 'success',
        timer: 2000,
        showConfirmButton: false,
      });
      onSaved();
    } catch {
      Swal.fire('Error', 'Error de conexión', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="secuencias-modal-overlay" onClick={onClose}>
      <div className="secuencias-modal" onClick={(e) => e.stopPropagation()}>
        <h3>{isEditing ? 'Editar Secuencia' : 'Nueva Secuencia'}</h3>

        <form onSubmit={handleSubmit}>
          <div className="form-field">
            <label htmlFor="tipo_comprobante">Tipo de Comprobante</label>
            <select
              id="tipo_comprobante"
              value={tipo}
              onChange={(e) => handleTipoChange(e.target.value)}
              disabled={isEditing}
              style={{ padding: '0.625rem', borderRadius: '6px', border: '1px solid #dadce0', width: '100%' }}
            >
              {TIPOS_COMPROBANTE.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </div>

          <div className="form-field">
            <label htmlFor="prefijo">Prefijo</label>
            <input
              id="prefijo"
              type="text"
              value={prefijo}
              onChange={(e) => setPrefijo(e.target.value)}
              style={{ padding: '0.625rem', borderRadius: '6px', border: '1px solid #dadce0', width: '100%' }}
            />
          </div>

          {!isEditing && (
            <div className="form-field">
              <label htmlFor="numero_inicio">Número Inicio</label>
              <input
                id="numero_inicio"
                type="number"
                min="1"
                value={inicio}
                onChange={(e) => setInicio(e.target.value)}
                style={{ padding: '0.625rem', borderRadius: '6px', border: '1px solid #dadce0', width: '100%' }}
              />
            </div>
          )}

          <div className="form-field">
            <label htmlFor="numero_fin">Número Fin</label>
            <input
              id="numero_fin"
              type="number"
              min="1"
              value={fin}
              onChange={(e) => setFin(e.target.value)}
              style={{ padding: '0.625rem', borderRadius: '6px', border: '1px solid #dadce0', width: '100%' }}
            />
          </div>

          {isEditing && (
            <div className="form-field">
              <label htmlFor="numero_actual">Número Actual</label>
              <input
                id="numero_actual"
                type="number"
                min="1"
                value={actual}
                onChange={(e) => setActual(e.target.value)}
                style={{ padding: '0.625rem', borderRadius: '6px', border: '1px solid #dadce0', width: '100%' }}
              />
              <span style={{ fontSize: '0.75rem', color: '#5f6368' }}>
                Siguiente número que se asignará
              </span>
            </div>
          )}

          <div className="secuencias-modal-actions">
            <button type="button" className="secuencias-btn-cancel" onClick={onClose}>
              Cancelar
            </button>
            <button type="submit" className="secuencias-btn-save" disabled={submitting}>
              {submitting ? 'Guardando...' : isEditing ? 'Guardar Cambios' : 'Crear Secuencia'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default SecuenciasNcf;
