import { useEffect, useState } from 'react';
import './Planes.css';

interface Plan {
  id: string;
  nombre: string;
  limite_facturas_mensual: number | null;
  precio: string;
  activo: boolean;
  permite_api: boolean;
}

function Planes() {
  const [planes, setPlanes] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch('/api/v1/planes')
      .then((res) => {
        if (!res.ok) throw new Error('Error al cargar planes');
        return res.json();
      })
      .then((data) => setPlanes(data))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="planes-page"><p className="planes-loading">Cargando planes...</p></div>;
  if (error) return <div className="planes-page"><p className="planes-error">{error}</p></div>;

  const planesNormales = planes.filter((p) => !p.permite_api && p.activo);
  const planesApi = planes.filter((p) => p.permite_api && p.activo);

  return (
    <div className="planes-page">
      <div className="planes-header">
        <h2>Planes Disponibles</h2>
        <p>Seleccione el plan que mejor se adapte a las necesidades de su empresa.</p>
      </div>

      {/* Facturación Inmediata */}
      <section className="planes-section">
        <div className="planes-section-header">
          <h3>📋 Facturación Inmediata</h3>
          <p>Emita comprobantes electrónicos directamente desde nuestra plataforma web.</p>
        </div>
        <div className="planes-grid">
          {planesNormales.map((plan, index) => (
            <div key={plan.id} className={`plan-card ${index === 1 ? 'plan-card--featured' : ''}`}>
              {index === 1 && <span className="plan-badge">Popular</span>}
              <h4 className="plan-nombre">{plan.nombre}</h4>
              <div className="plan-precio">
                <span className="plan-precio-valor">RD${Number(plan.precio).toLocaleString('es-DO', { minimumFractionDigits: 2 })}</span>
                <span className="plan-precio-periodo">/mes</span>
              </div>
              <ul className="plan-features">
                <li>{plan.limite_facturas_mensual === null ? '✓ Facturas ilimitadas' : `✓ Hasta ${plan.limite_facturas_mensual} facturas/mes`}</li>
                <li>✓ Firma digital XAdES-BES</li>
                <li>✓ PDF con código QR</li>
                <li>✓ Almacenamiento XML/PDF</li>
                <li>✓ Validación RNC automática</li>
                {index >= 1 && <li>✓ Soporte prioritario</li>}
                {index === 2 && <li>✓ Usuarios ilimitados</li>}
              </ul>
              <button className={`plan-btn ${index === 1 ? 'plan-btn--primary' : ''}`}>
                Seleccionar Plan
              </button>
            </div>
          ))}
        </div>
      </section>

      {/* Facturación vía API */}
      <section className="planes-section">
        <div className="planes-section-header">
          <h3>🔗 Facturación desde tu Sistema</h3>
          <p>Integre su ERP, POS o sistema contable con nuestra API REST dedicada.</p>
        </div>
        <div className="planes-grid">
          {planesApi.map((plan, index) => (
            <div key={plan.id} className={`plan-card plan-card--api ${index === 1 ? 'plan-card--featured' : ''}`}>
              {index === 1 && <span className="plan-badge">Recomendado</span>}
              <h4 className="plan-nombre">{plan.nombre}</h4>
              <div className="plan-precio">
                <span className="plan-precio-valor">RD${Number(plan.precio).toLocaleString('es-DO', { minimumFractionDigits: 2 })}</span>
                <span className="plan-precio-periodo">/mes</span>
              </div>
              <ul className="plan-features">
                <li>{plan.limite_facturas_mensual === null ? '✓ Facturas ilimitadas' : `✓ Hasta ${plan.limite_facturas_mensual} facturas/mes`}</li>
                <li>✓ API REST dedicada</li>
                <li>✓ API Keys con scopes</li>
                <li>✓ Documentación Swagger</li>
                <li>✓ Certificación DGII guiada</li>
                <li>✓ Circuit breaker + reintentos</li>
                {index >= 1 && <li>✓ Soporte técnico dedicado</li>}
                {index === 2 && <li>✓ Rate limit 1000 req/min</li>}
              </ul>
              <button className={`plan-btn ${index === 1 ? 'plan-btn--primary' : ''}`}>
                Seleccionar Plan
              </button>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

export default Planes;
