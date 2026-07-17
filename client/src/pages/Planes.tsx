import { useEffect, useState } from 'react';
import './Planes.css';

interface Plan {
  id: string;
  nombre: string;
  limite_facturas_mensual: number | null;
  precio: string;
  activo: boolean;
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

  if (loading) {
    return (
      <div className="planes-page">
        <p className="planes-loading">Cargando planes...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="planes-page">
        <p className="planes-error">{error}</p>
      </div>
    );
  }

  return (
    <div className="planes-page">
      <div className="planes-header">
        <h2>Planes Disponibles</h2>
        <p>Seleccione el plan que mejor se adapte a las necesidades de su empresa.</p>
      </div>

      <div className="planes-grid">
        {planes.map((plan, index) => (
          <div
            key={plan.id}
            className={`plan-card ${index === 1 ? 'plan-card--featured' : ''}`}
          >
            {index === 1 && <span className="plan-badge">Popular</span>}
            <h3 className="plan-nombre">{plan.nombre}</h3>
            <div className="plan-precio">
              <span className="plan-precio-valor">RD${plan.precio}</span>
              <span className="plan-precio-periodo">/mes</span>
            </div>
            <ul className="plan-features">
              <li>
                {plan.limite_facturas_mensual === null
                  ? '✓ Facturas ilimitadas'
                  : `✓ Hasta ${plan.limite_facturas_mensual} facturas/mes`}
              </li>
              <li>✓ Firma digital DGII</li>
              <li>✓ Almacenamiento XML/PDF</li>
              {index >= 1 && <li>✓ Soporte prioritario</li>}
              {index === 2 && <li>✓ API dedicada</li>}
            </ul>
            <button className={`plan-btn ${index === 1 ? 'plan-btn--primary' : ''}`}>
              Seleccionar Plan
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

export default Planes;
