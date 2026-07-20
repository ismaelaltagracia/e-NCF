import { useEffect, useState } from 'react';
import Swal from 'sweetalert2';
import { useAuth } from '../context/AuthContext';
import './MiPlan.css';

interface Plan {
  id: string;
  nombre: string;
  limite_facturas_mensual: number | null;
  precio: string;
  activo: boolean;
  permite_api: boolean;
}

interface MiPlanData {
  plan_id: string | null;
  plan: Plan | null;
}

function MiPlan() {
  const { authFetch, userRole } = useAuth();
  const [miPlan, setMiPlan] = useState<MiPlanData | null>(null);
  const [planes, setPlanes] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const isAdmin = userRole === 'admin';

  const fetchMiPlan = async () => {
    try {
      const res = await authFetch('/api/v1/empresas/me/plan');
      if (!res.ok) throw new Error('Error al cargar plan actual');
      const data = await res.json();
      setMiPlan(data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error desconocido');
    }
  };

  const fetchPlanes = async () => {
    try {
      const res = await fetch('/api/v1/planes');
      if (!res.ok) throw new Error('Error al cargar planes');
      const data = await res.json();
      setPlanes(data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error desconocido');
    }
  };

  useEffect(() => {
    Promise.all([fetchMiPlan(), fetchPlanes()]).finally(() => setLoading(false));
  }, []);

  const handleCambiarPlan = async (plan: Plan) => {
    const currentPermiteApi = miPlan?.plan?.permite_api ?? false;

    // If downgrading from API plan to non-API plan, show warning
    if (currentPermiteApi && !plan.permite_api) {
      const result = await Swal.fire({
        icon: 'warning',
        title: '⚠️ Perderá acceso a la integración API',
        html: 'Su sistema externo <strong>NO</strong> podrá emitir facturas.<br>Solo podrá facturar desde la aplicación web o móvil.<br><br>¿Está seguro?',
        showCancelButton: true,
        confirmButtonText: 'Sí, cambiar plan',
        cancelButtonText: 'Cancelar',
        confirmButtonColor: '#d93025',
      });
      if (!result.isConfirmed) return;
    } else {
      const result = await Swal.fire({
        icon: 'question',
        title: '¿Desea cambiar al plan ' + plan.nombre + '?',
        showCancelButton: true,
        confirmButtonText: 'Sí, cambiar',
        cancelButtonText: 'Cancelar',
        confirmButtonColor: '#1a73e8',
      });
      if (!result.isConfirmed) return;
    }

    try {
      const res = await authFetch('/api/v1/empresas/me/plan', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan_id: plan.id }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.message || 'Error al cambiar plan');
      }

      await Swal.fire({
        icon: 'success',
        title: 'Plan actualizado',
        text: `Ahora está en el plan "${plan.nombre}".`,
        confirmButtonColor: '#1a73e8',
      });

      // Reload current plan info
      await fetchMiPlan();
    } catch (err: unknown) {
      Swal.fire({
        icon: 'error',
        title: 'Error',
        text: err instanceof Error ? err.message : 'No se pudo cambiar el plan',
      });
    }
  };

  if (loading) return <div className="miplan-page"><p className="miplan-loading">Cargando...</p></div>;
  if (error) return <div className="miplan-page"><p className="miplan-error">{error}</p></div>;

  const planesActivos = planes.filter((p) => p.activo);
  const planesNormales = planesActivos.filter((p) => !p.permite_api);
  const planesApi = planesActivos.filter((p) => p.permite_api);

  return (
    <div className="miplan-page">
      <div className="miplan-header">
        <h2>Mi Plan</h2>
        <p>Gestione el plan de facturación de su empresa.</p>
      </div>

      {/* Current plan banner */}
      {miPlan?.plan ? (
        <div className="miplan-current">
          <div className="miplan-current-info">
            <h3>
              Plan Actual: {miPlan.plan.nombre}
              {miPlan.plan.permite_api ? (
                <span className="miplan-badge-api">API</span>
              ) : (
                <span className="miplan-badge-no-api">Sin API</span>
              )}
            </h3>
            <div className="miplan-current-details">
              <span>
                {miPlan.plan.limite_facturas_mensual === null
                  ? '📋 Facturas ilimitadas'
                  : `📋 Hasta ${miPlan.plan.limite_facturas_mensual} facturas/mes`}
              </span>
            </div>
          </div>
          <div className="miplan-current-price">
            RD${Number(miPlan.plan.precio).toLocaleString('es-DO', { minimumFractionDigits: 2 })}
            <small>/mes</small>
          </div>
        </div>
      ) : (
        <div className="miplan-no-plan">
          ⚠️ No tiene un plan asignado. Seleccione uno a continuación.
        </div>
      )}

      {/* Facturación Inmediata */}
      {planesNormales.length > 0 && (
        <section className="miplan-section">
          <div className="miplan-section-header">
            <h3>📋 Facturación Inmediata</h3>
            <p>Emita comprobantes electrónicos directamente desde nuestra plataforma web.</p>
          </div>
          <div className="miplan-grid">
            {planesNormales.map((plan) => {
              const isCurrent = plan.id === miPlan?.plan_id;
              return (
                <div key={plan.id} className={`miplan-card ${isCurrent ? 'miplan-card--current' : ''}`}>
                  {isCurrent && <span className="miplan-card-badge miplan-card-badge--current">Plan Actual</span>}
                  <h4 className="miplan-card-nombre">{plan.nombre}</h4>
                  <div className="miplan-card-precio">
                    <span className="miplan-card-precio-valor">
                      RD${Number(plan.precio).toLocaleString('es-DO', { minimumFractionDigits: 2 })}
                    </span>
                    <span className="miplan-card-precio-periodo">/mes</span>
                  </div>
                  <ul className="miplan-card-features">
                    <li>{plan.limite_facturas_mensual === null ? '✓ Facturas ilimitadas' : `✓ Hasta ${plan.limite_facturas_mensual} facturas/mes`}</li>
                    <li>✓ Firma digital XAdES-BES</li>
                    <li>✓ PDF con código QR</li>
                    <li>✓ Almacenamiento XML/PDF</li>
                    <li>✓ Validación RNC automática</li>
                  </ul>
                  {isAdmin && (
                    <button
                      className={`miplan-btn ${isCurrent ? 'miplan-btn--disabled' : 'miplan-btn--primary'}`}
                      disabled={isCurrent}
                      onClick={() => handleCambiarPlan(plan)}
                    >
                      {isCurrent ? 'Plan Actual' : 'Cambiar a este plan'}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Facturación vía API */}
      {planesApi.length > 0 && (
        <section className="miplan-section">
          <div className="miplan-section-header">
            <h3>🔗 Facturación desde tu Sistema</h3>
            <p>Integre su ERP, POS o sistema contable con nuestra API REST dedicada.</p>
          </div>
          <div className="miplan-grid">
            {planesApi.map((plan) => {
              const isCurrent = plan.id === miPlan?.plan_id;
              return (
                <div key={plan.id} className={`miplan-card miplan-card--api ${isCurrent ? 'miplan-card--current' : ''}`}>
                  {isCurrent && <span className="miplan-card-badge miplan-card-badge--current">Plan Actual</span>}
                  <h4 className="miplan-card-nombre">{plan.nombre}</h4>
                  <div className="miplan-card-precio">
                    <span className="miplan-card-precio-valor">
                      RD${Number(plan.precio).toLocaleString('es-DO', { minimumFractionDigits: 2 })}
                    </span>
                    <span className="miplan-card-precio-periodo">/mes</span>
                  </div>
                  <ul className="miplan-card-features">
                    <li>{plan.limite_facturas_mensual === null ? '✓ Facturas ilimitadas' : `✓ Hasta ${plan.limite_facturas_mensual} facturas/mes`}</li>
                    <li>✓ API REST dedicada</li>
                    <li>✓ API Keys con scopes</li>
                    <li>✓ Documentación Swagger</li>
                    <li>✓ Certificación DGII guiada</li>
                    <li>✓ Circuit breaker + reintentos</li>
                  </ul>
                  {isAdmin && (
                    <button
                      className={`miplan-btn ${isCurrent ? 'miplan-btn--disabled' : 'miplan-btn--primary'}`}
                      disabled={isCurrent}
                      onClick={() => handleCambiarPlan(plan)}
                    >
                      {isCurrent ? 'Plan Actual' : 'Cambiar a este plan'}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}

export default MiPlan;
