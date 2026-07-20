import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import './Dashboard.css';

interface UsageData {
  facturas_mes: number;
  facturas_limite: number;
  plan_nombre: string;
}

interface CertificadoEstado {
  estado: string;
  vence_en: string | null;
  dias_restantes: number | null;
}

interface Permisos {
  ambiente: string;
  permite_api: boolean;
  permite_recepcion: boolean;
}

function Dashboard() {
  const navigate = useNavigate();
  const [usage, setUsage] = useState<UsageData | null>(null);
  const [certEstado, setCertEstado] = useState<CertificadoEstado | null>(null);
  const [permisos, setPermisos] = useState<Permisos | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('access_token');
    const headers = { Authorization: `Bearer ${token}` };

    Promise.allSettled([
      fetch('/api/v1/empresas/me/uso', { headers }).then((r) => (r.ok ? r.json() : null)),
      fetch('/api/v1/empresas/me/certificado-estado', { headers }).then((r) => (r.ok ? r.json() : null)),
      fetch('/api/v1/empresas/me/permisos', { headers }).then((r) => (r.ok ? r.json() : null)),
    ]).then(([usoResult, certResult, permResult]) => {
      if (usoResult.status === 'fulfilled' && usoResult.value) setUsage(usoResult.value);
      if (certResult.status === 'fulfilled' && certResult.value) setCertEstado(certResult.value);
      if (permResult.status === 'fulfilled' && permResult.value) setPermisos(permResult.value);
      setLoading(false);
    });
  }, []);

  const getCertLabel = (estado: string) => {
    switch (estado) {
      case 'activo': return 'Activo';
      case 'por_vencer': return 'Por vencer';
      case 'vencido': return 'Vencido';
      case 'sin_certificado': return 'Sin certificado';
      default: return estado;
    }
  };

  const getCertClass = (estado: string) => {
    switch (estado) {
      case 'activo': return 'status--success';
      case 'por_vencer': return 'status--warning';
      case 'vencido': return 'status--danger';
      default: return 'status--muted';
    }
  };

  const getAmbienteLabel = (ambiente: string) => {
    return ambiente === 'produccion' ? '🟢 Producción' : '🟡 TesteCF (Pruebas)';
  };

  if (loading) {
    return (
      <div className="dashboard">
        <div className="dashboard-loading">
          <div className="loading-spinner" />
          <p>Cargando información...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="dashboard">
      <div className="dashboard-greeting">
        <div className="greeting-text">
          <h1>Bienvenido</h1>
          <p>Resumen de tu cuenta e-NCF</p>
        </div>
        <div className="quick-actions">
          <button className="quick-action-btn" onClick={() => navigate('/facturas/nueva')}>
            <span className="quick-action-icon">➕</span>
            <span className="quick-action-label">Nueva Factura</span>
          </button>
          <button className="quick-action-btn" onClick={() => navigate('/catalogo')}>
            <span className="quick-action-icon">📦</span>
            <span className="quick-action-label">Catálogo</span>
          </button>
          <button className="quick-action-btn" onClick={() => navigate('/facturas-recibidas')}>
            <span className="quick-action-icon">📥</span>
            <span className="quick-action-label">Recibidas</span>
          </button>
          <button className="quick-action-btn" onClick={() => navigate('/configuracion')}>
            <span className="quick-action-icon">⚙️</span>
            <span className="quick-action-label">Configuración</span>
          </button>
        </div>
      </div>

      <div className="dashboard-grid">
        {/* Facturas del mes */}
        <div className="metric-card">
          <div className="metric-card-icon">🧾</div>
          <div className="metric-card-body">
            <span className="metric-label">Facturas este mes</span>
            <span className="metric-value">
              {usage ? `${usage.facturas_mes} / ${usage.facturas_limite}` : '—'}
            </span>
            {usage && (
              <div className="metric-bar">
                <div
                  className="metric-bar-fill"
                  style={{ width: `${Math.min((usage.facturas_mes / usage.facturas_limite) * 100, 100)}%` }}
                />
              </div>
            )}
          </div>
        </div>

        {/* Plan actual */}
        <div className="metric-card">
          <div className="metric-card-icon">📋</div>
          <div className="metric-card-body">
            <span className="metric-label">Plan actual</span>
            <span className="metric-value">{usage?.plan_nombre || '—'}</span>
          </div>
        </div>

        {/* Estado certificado */}
        <div className="metric-card">
          <div className="metric-card-icon">🏅</div>
          <div className="metric-card-body">
            <span className="metric-label">Certificado digital</span>
            <span className={`metric-status ${certEstado ? getCertClass(certEstado.estado) : ''}`}>
              {certEstado ? getCertLabel(certEstado.estado) : '—'}
            </span>
            {certEstado?.vence_en && certEstado.estado === 'activo' && (
              <span className="metric-sub">
                Vence: {new Date(certEstado.vence_en).toLocaleDateString('es-DO')}
              </span>
            )}
            {certEstado?.estado === 'por_vencer' && certEstado.dias_restantes != null && (
              <span className="metric-sub">
                {certEstado.dias_restantes} días restantes
              </span>
            )}
          </div>
        </div>

        {/* Ambiente DGII */}
        <div className="metric-card">
          <div className="metric-card-icon">🌐</div>
          <div className="metric-card-body">
            <span className="metric-label">Ambiente DGII</span>
            <span className="metric-value">
              {permisos ? getAmbienteLabel(permisos.ambiente) : '—'}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default Dashboard;
