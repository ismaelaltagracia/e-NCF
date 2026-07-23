import { useState, useEffect, useCallback } from 'react';
import Swal from 'sweetalert2';
import './FacturasRecibidas.css';

interface FacturaRecibida {
  id: string;
  rnc_emisor: string;
  nombre_emisor: string;
  e_ncf: string;
  fecha_emision: string;
  monto_total: number;
  estado_aprobacion: 'pendiente' | 'aprobada' | 'rechazada';
  motivo_rechazo: string | null;
  track_id_aprobacion: string | null;
  created_at: string;
}

function getAccessToken(): string {
  return localStorage.getItem('access_token') || '';
}

function formatCurrency(value: number): string {
  return `RD$ ${value.toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function FacturasRecibidas() {
  const [facturas, setFacturas] = useState<FacturaRecibida[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({
    rnc_emisor: '',
    nombre_emisor: '',
    e_ncf: '',
    fecha_emision: '',
    monto_total: '',
  });
  const [submitting, setSubmitting] = useState(false);

  const fetchFacturas = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/v1/facturas-recibidas', {
        headers: { Authorization: `Bearer ${getAccessToken()}` },
      });
      if (res.ok) {
        const data = await res.json();
        setFacturas(Array.isArray(data) ? data : []);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchFacturas();
  }, [fetchFacturas]);

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const res = await fetch('/api/v1/facturas-recibidas', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${getAccessToken()}`,
        },
        body: JSON.stringify({
          rnc_emisor: formData.rnc_emisor,
          nombre_emisor: formData.nombre_emisor,
          e_ncf: formData.e_ncf,
          fecha_emision: formData.fecha_emision,
          monto_total: parseFloat(formData.monto_total),
        }),
      });
      if (res.ok) {
        await Swal.fire('Registrada', 'Factura recibida registrada exitosamente.', 'success');
        setFormData({ rnc_emisor: '', nombre_emisor: '', e_ncf: '', fecha_emision: '', monto_total: '' });
        setShowForm(false);
        fetchFacturas();
      } else {
        const body = await res.json();
        await Swal.fire('Error', body.message || 'Error al registrar factura', 'error');
      }
    } catch {
      await Swal.fire('Error', 'Error de conexión', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleAprobar = async (id: string) => {
    const result = await Swal.fire({
      title: '¿Aprobar esta factura?',
      text: 'Se enviará la aprobación comercial a la DGII.',
      icon: 'question',
      showCancelButton: true,
      confirmButtonColor: '#1e8e3e',
      confirmButtonText: 'Sí, aprobar',
      cancelButtonText: 'Cancelar',
    });
    if (!result.isConfirmed) return;

    try {
      const res = await fetch(`/api/v1/facturas-recibidas/${id}/aprobar`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${getAccessToken()}` },
      });
      if (res.ok) {
        await Swal.fire('Aprobada', 'Factura aprobada exitosamente.', 'success');
        fetchFacturas();
      } else {
        const body = await res.json();
        await Swal.fire('Error', body.message || 'Error al aprobar', 'error');
      }
    } catch {
      await Swal.fire('Error', 'Error de conexión', 'error');
    }
  };

  const handleRechazar = async (id: string) => {
    const result = await Swal.fire({
      title: '¿Rechazar esta factura?',
      input: 'textarea',
      inputLabel: 'Motivo del rechazo',
      inputPlaceholder: 'Escriba el motivo del rechazo...',
      inputValidator: (value) => {
        if (!value || !value.trim()) return 'Debe indicar un motivo';
        return null;
      },
      showCancelButton: true,
      confirmButtonColor: '#d93025',
      confirmButtonText: 'Rechazar',
      cancelButtonText: 'Cancelar',
    });
    if (!result.isConfirmed || !result.value) return;

    try {
      const res = await fetch(`/api/v1/facturas-recibidas/${id}/rechazar`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${getAccessToken()}`,
        },
        body: JSON.stringify({ motivo: result.value }),
      });
      if (res.ok) {
        await Swal.fire('Rechazada', 'Factura rechazada.', 'success');
        fetchFacturas();
      } else {
        const body = await res.json();
        await Swal.fire('Error', body.message || 'Error al rechazar', 'error');
      }
    } catch {
      await Swal.fire('Error', 'Error de conexión', 'error');
    }
  };

  return (
    <div className="facturas-recibidas">
      <div className="facturas-recibidas-header">
        <h2>Facturas Recibidas</h2>
        <button className="facturas-recibidas-btn-toggle" onClick={() => setShowForm(!showForm)}>
          {showForm ? 'Cerrar formulario' : '+ Registrar factura recibida'}
        </button>
      </div>

      {showForm && (
        <form className="facturas-recibidas-form" onSubmit={handleRegister}>
          <h3>Registrar Factura Recibida</h3>
          <div className="facturas-recibidas-form-grid">
            <div className="facturas-recibidas-form-field">
              <label>RNC Emisor</label>
              <input
                type="text"
                maxLength={11}
                value={formData.rnc_emisor}
                onChange={(e) => setFormData({ ...formData, rnc_emisor: e.target.value })}
                placeholder="9 u 11 dígitos"
                required
              />
            </div>
            <div className="facturas-recibidas-form-field">
              <label>Nombre Emisor</label>
              <input
                type="text"
                value={formData.nombre_emisor}
                onChange={(e) => setFormData({ ...formData, nombre_emisor: e.target.value })}
                placeholder="Razón social"
                required
              />
            </div>
            <div className="facturas-recibidas-form-field">
              <label>No. Comprobante</label>
              <input
                type="text"
                value={formData.e_ncf}
                onChange={(e) => setFormData({ ...formData, e_ncf: e.target.value })}
                placeholder="E310000000001"
                required
              />
            </div>
            <div className="facturas-recibidas-form-field">
              <label>Fecha Emisión</label>
              <input
                type="date"
                value={formData.fecha_emision}
                onChange={(e) => setFormData({ ...formData, fecha_emision: e.target.value })}
                required
              />
            </div>
            <div className="facturas-recibidas-form-field">
              <label>Monto Total</label>
              <input
                type="number"
                step="0.01"
                min="0.01"
                value={formData.monto_total}
                onChange={(e) => setFormData({ ...formData, monto_total: e.target.value })}
                placeholder="0.00"
                required
              />
            </div>
          </div>
          <div className="facturas-recibidas-form-actions">
            <button type="submit" disabled={submitting}>
              {submitting ? 'Registrando...' : 'Registrar'}
            </button>
            <button type="button" onClick={() => setShowForm(false)}>Cancelar</button>
          </div>
        </form>
      )}

      {loading ? (
        <p>Cargando facturas recibidas...</p>
      ) : facturas.length === 0 ? (
        <div className="facturas-recibidas-empty">
          <p>No hay facturas recibidas registradas.</p>
        </div>
      ) : (
        <table className="facturas-recibidas-tabla">
          <thead>
            <tr>
              <th>Fecha</th>
              <th>No. Comprobante</th>
              <th>Emisor</th>
              <th>Monto</th>
              <th>Estado</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {facturas.map((f) => (
              <tr key={f.id}>
                <td>{f.fecha_emision}</td>
                <td><code>{f.e_ncf}</code></td>
                <td>{f.nombre_emisor}</td>
                <td>{formatCurrency(Number(f.monto_total))}</td>
                <td>
                  <span className={`estado-badge ${f.estado_aprobacion}`}>
                    {f.estado_aprobacion}
                  </span>
                </td>
                <td>
                  {f.estado_aprobacion === 'pendiente' && (
                    <div className="facturas-recibidas-actions">
                      <button className="btn-aprobar" onClick={() => handleAprobar(f.id)}>
                        Aprobar
                      </button>
                      <button className="btn-rechazar" onClick={() => handleRechazar(f.id)}>
                        Rechazar
                      </button>
                    </div>
                  )}
                  {f.estado_aprobacion === 'rechazada' && f.motivo_rechazo && (
                    <span style={{ fontSize: '0.75rem', color: '#5f6368' }} title={f.motivo_rechazo}>
                      Motivo: {f.motivo_rechazo.substring(0, 30)}...
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

export default FacturasRecibidas;
