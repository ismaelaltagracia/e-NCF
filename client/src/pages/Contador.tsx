import { useState, useEffect } from 'react';
import './Contador.css';

interface ContadorEmpresa {
  id: string;
  empresa_id: string;
  empresa: { id: string; nombre: string; rnc: string };
  plan: { id: string; nombre: string; precio: string };
  activo: boolean;
  fecha_alta: string;
}

interface FacturaPreview {
  subtotal: number;
  descuento_total: number;
  total: number;
  cantidad_empresas: number;
  empresas_con_descuento: number;
  detalle: Array<{
    empresa_id: string;
    empresa_nombre: string;
    plan_nombre: string;
    precio_base: number;
    descuento_aplicado: boolean;
    precio_final: number;
  }>;
}

interface Plan {
  id: string;
  nombre: string;
  precio: string;
  limite_facturas_mensual: number | null;
  activo: boolean;
}

function ContadorPanel() {
  const [empresas, setEmpresas] = useState<ContadorEmpresa[]>([]);
  const [factura, setFactura] = useState<FacturaPreview | null>(null);
  const [planes, setPlanes] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);

  const token = localStorage.getItem('access_token');
  const headers = { Authorization: `Bearer ${token}` };

  useEffect(() => { loadAll(); }, []);

  const loadAll = async () => {
    setLoading(true);
    try {
      const [empRes, factRes, planRes] = await Promise.all([
        fetch('/api/v1/contador/empresas', { headers }),
        fetch('/api/v1/contador/factura-actual', { headers }),
        fetch('/api/v1/planes'),
      ]);
      if (empRes.ok) setEmpresas(await empRes.json());
      if (factRes.ok) setFactura(await factRes.json());
      if (planRes.ok) {
        const data = await planRes.json();
        setPlanes(data.filter((p: Plan) => p.activo));
      }
    } catch {}
    setLoading(false);
  };

  const handleCrearEmpresa = async (data: { nombre: string; rnc: string; plan_id: string }) => {
    const res = await fetch('/api/v1/contador/empresas', {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (res.ok) {
      setShowModal(false);
      loadAll();
    }
  };

  const handleCambiarEmpresa = async (empresaId: string) => {
    const res = await fetch('/api/v1/contador/cambiar-empresa', {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ empresa_id: empresaId }),
    });
    if (res.ok) {
      const data = await res.json();
      if (data.access_token) {
        localStorage.setItem('access_token', data.access_token);
      }
      window.location.href = '/dashboard';
    }
  };

  if (loading) {
    return <div className="contador"><p>Cargando...</p></div>;
  }

  return (
    <div className="contador">
      <div className="contador-header">
        <div>
          <h2>Panel de Contador</h2>
          <p>Gestione las empresas de sus clientes</p>
        </div>
        <button className="contador-btn-add" onClick={() => setShowModal(true)}>
          + Agregar empresa
        </button>
      </div>

      {/* Summary */}
      <div className="contador-summary">
        <div className="contador-stat">
          <div className="contador-stat-value">{empresas.length}</div>
          <div className="contador-stat-label">Empresas activas</div>
        </div>
        <div className="contador-stat">
          <div className="contador-stat-value">
            {factura ? `RD$ ${factura.total.toLocaleString('es-DO', { minimumFractionDigits: 2 })}` : '—'}
          </div>
          <div className="contador-stat-label">Factura este mes</div>
        </div>
        <div className="contador-stat">
          <div className="contador-stat-value">
            {factura ? `RD$ ${factura.descuento_total.toLocaleString('es-DO', { minimumFractionDigits: 2 })}` : '—'}
          </div>
          <div className="contador-stat-label">Ahorro por descuento</div>
        </div>
      </div>

      {/* Empresas */}
      <div className="contador-grid">
        {empresas.map((ce, idx) => (
          <div
            key={ce.id}
            className="contador-empresa-card"
            onClick={() => handleCambiarEmpresa(ce.empresa_id)}
          >
            <div className="contador-empresa-card-header">
              <span className="contador-empresa-nombre">{ce.empresa.nombre}</span>
              <span className={`contador-empresa-badge ${idx >= 2 ? 'badge-descuento' : 'badge-normal'}`}>
                {idx >= 2 ? '-20%' : 'Precio base'}
              </span>
            </div>
            <div className="contador-empresa-rnc">RNC: {ce.empresa.rnc}</div>
            <div className="contador-empresa-plan">Plan: {ce.plan.nombre}</div>
            <div className="contador-empresa-precio">
              {idx >= 2 && (
                <span className="precio-tachado">
                  RD$ {Number(ce.plan.precio).toLocaleString('es-DO', { minimumFractionDigits: 2 })}
                </span>
              )}
              RD$ {(Number(ce.plan.precio) * (idx >= 2 ? 0.8 : 1)).toLocaleString('es-DO', { minimumFractionDigits: 2 })}/mes
            </div>
          </div>
        ))}
      </div>

      {/* Factura preview */}
      {factura && factura.detalle.length > 0 && (
        <div className="contador-factura">
          <h3>Factura del mes actual</h3>
          <table className="contador-factura-tabla">
            <thead>
              <tr>
                <th>Empresa</th>
                <th>Plan</th>
                <th>Precio</th>
                <th>Descuento</th>
                <th>Total</th>
              </tr>
            </thead>
            <tbody>
              {factura.detalle.map((d) => (
                <tr key={d.empresa_id}>
                  <td>{d.empresa_nombre}</td>
                  <td>{d.plan_nombre}</td>
                  <td>RD$ {d.precio_base.toFixed(2)}</td>
                  <td>{d.descuento_aplicado ? '20%' : '—'}</td>
                  <td style={{ fontWeight: 600 }}>RD$ {d.precio_final.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="contador-factura-total">
            <span>Total a pagar</span>
            <span>RD$ {factura.total.toLocaleString('es-DO', { minimumFractionDigits: 2 })}</span>
          </div>
        </div>
      )}

      {/* Historial de facturas */}
      <HistorialFacturas headers={headers} />

      {/* Modal crear empresa */}
      {showModal && (
        <CrearEmpresaModal
          planes={planes}
          onClose={() => setShowModal(false)}
          onSubmit={handleCrearEmpresa}
        />
      )}
    </div>
  );
}

function CrearEmpresaModal({
  planes,
  onClose,
  onSubmit,
}: {
  planes: Plan[];
  onClose: () => void;
  onSubmit: (data: { nombre: string; rnc: string; plan_id: string }) => void;
}) {
  const [nombre, setNombre] = useState('');
  const [rnc, setRnc] = useState('');
  const [planId, setPlanId] = useState(planes[0]?.id || '');

  return (
    <div className="contador-modal-overlay" onClick={onClose}>
      <div className="contador-modal" onClick={(e) => e.stopPropagation()}>
        <h3>Agregar empresa</h3>
        <div className="form-field">
          <label>Nombre de la empresa</label>
          <input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Razón social" />
        </div>
        <div className="form-field">
          <label>RNC (9 u 11 dígitos)</label>
          <input value={rnc} onChange={(e) => setRnc(e.target.value)} placeholder="123456789" maxLength={11} />
        </div>
        <div className="form-field">
          <label>Plan</label>
          <select value={planId} onChange={(e) => setPlanId(e.target.value)}>
            {planes.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nombre} — RD$ {Number(p.precio).toLocaleString('es-DO')} ({p.limite_facturas_mensual ?? '∞'} facturas)
              </option>
            ))}
          </select>
        </div>
        <div className="contador-modal-actions">
          <button className="btn-modal-cancel" onClick={onClose}>Cancelar</button>
          <button
            className="btn-modal-primary"
            onClick={() => { if (nombre && rnc && planId) onSubmit({ nombre, rnc, plan_id: planId }); }}
          >
            Crear empresa
          </button>
        </div>
      </div>
    </div>
  );
}

export default ContadorPanel;

function HistorialFacturas({ headers }: { headers: Record<string, string> }) {
  const [facturas, setFacturas] = useState<Array<{
    id: string;
    periodo: string;
    total: number;
    descuento: number;
    estado: string;
    created_at: string;
  }>>([]);

  useEffect(() => {
    fetch('/api/v1/contador/facturas', { headers })
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => { if (Array.isArray(data)) setFacturas(data); })
      .catch(() => {});
  }, []);

  if (facturas.length === 0) return null;

  return (
    <div className="contador-factura" style={{ marginTop: '1.5rem' }}>
      <h3>Historial de facturas</h3>
      <table className="contador-factura-tabla">
        <thead>
          <tr>
            <th>Período</th>
            <th>Total</th>
            <th>Descuento</th>
            <th>Estado</th>
            <th>Fecha</th>
          </tr>
        </thead>
        <tbody>
          {facturas.map((f) => (
            <tr key={f.id}>
              <td>{f.periodo}</td>
              <td style={{ fontWeight: 600 }}>RD$ {Number(f.total).toFixed(2)}</td>
              <td style={{ color: '#059669' }}>-RD$ {Number(f.descuento).toFixed(2)}</td>
              <td>
                <span style={{
                  padding: '2px 8px',
                  borderRadius: '4px',
                  fontSize: '0.72rem',
                  fontWeight: 600,
                  background: f.estado === 'pagada' ? '#ecfdf5' : f.estado === 'vencida' ? '#fef2f2' : '#fffbeb',
                  color: f.estado === 'pagada' ? '#059669' : f.estado === 'vencida' ? '#dc2626' : '#d97706',
                }}>
                  {f.estado}
                </span>
              </td>
              <td>{new Date(f.created_at).toLocaleDateString('es-DO')}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
