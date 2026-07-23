import { useState } from 'react';
import './Reportes.css';

interface Resumen {
  periodo: string;
  formato_606: { registros: number };
  formato_607: { registros: number };
  formato_608: { registros: number };
}

function Reportes() {
  const now = new Date();
  const [anio, setAnio] = useState(now.getFullYear());
  const [mes, setMes] = useState(now.getMonth() + 1);
  const [resumen, setResumen] = useState<Resumen | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const token = localStorage.getItem('access_token');
  const headers = { Authorization: `Bearer ${token}` };

  const meses = [
    'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
  ];

  const handleConsultar = async () => {
    setLoading(true);
    setError('');
    setResumen(null);

    try {
      const res = await fetch(`/api/v1/reportes/resumen?anio=${anio}&mes=${mes}`, { headers });
      if (!res.ok) {
        const body = await res.json();
        setError(body.message || 'Error al consultar reportes');
        return;
      }
      const data: Resumen = await res.json();
      setResumen(data);
    } catch {
      setError('Error de conexión');
    } finally {
      setLoading(false);
    }
  };

  const handleDescargar = (formato: '606' | '607' | '608') => {
    window.open(`/api/v1/reportes/${formato}?anio=${anio}&mes=${mes}`, '_blank');
  };

  return (
    <div className="reportes">
      <div className="reportes-header">
        <h2>Reportes Fiscales</h2>
        <p>Genere los formatos 606, 607 y 608 para declaración ante la DGII.</p>
      </div>

      <div className="reportes-filters">
        <div className="reportes-field">
          <label>Año</label>
          <select value={anio} onChange={(e) => setAnio(Number(e.target.value))}>
            {Array.from({ length: 7 }, (_, i) => now.getFullYear() - i).map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        </div>
        <div className="reportes-field">
          <label>Mes</label>
          <select value={mes} onChange={(e) => setMes(Number(e.target.value))}>
            {meses.map((nombre, idx) => (
              <option key={idx} value={idx + 1}>{nombre}</option>
            ))}
          </select>
        </div>
        <button className="reportes-btn-consultar" onClick={handleConsultar} disabled={loading}>
          {loading ? 'Consultando...' : 'Consultar período'}
        </button>
      </div>

      {error && <div className="reportes-error">{error}</div>}

      {resumen && (
        <div className="reportes-results">
          <h3>Período: {meses[mes - 1]} {anio}</h3>

          <div className="reportes-grid">
            <div className="reporte-card">
              <div className="reporte-card-header">
                <span className="reporte-card-icon">📥</span>
                <span className="reporte-card-title">Formato 606</span>
              </div>
              <p className="reporte-card-desc">Compras y Gastos</p>
              <span className="reporte-card-count">{resumen.formato_606.registros} registros</span>
              <button
                className="reporte-card-btn"
                onClick={() => handleDescargar('606')}
                disabled={resumen.formato_606.registros === 0}
              >
                Descargar TXT
              </button>
            </div>

            <div className="reporte-card">
              <div className="reporte-card-header">
                <span className="reporte-card-icon">📤</span>
                <span className="reporte-card-title">Formato 607</span>
              </div>
              <p className="reporte-card-desc">Ventas de Bienes y Servicios</p>
              <span className="reporte-card-count">{resumen.formato_607.registros} registros</span>
              <button
                className="reporte-card-btn"
                onClick={() => handleDescargar('607')}
                disabled={resumen.formato_607.registros === 0}
              >
                Descargar TXT
              </button>
            </div>

            <div className="reporte-card">
              <div className="reporte-card-header">
                <span className="reporte-card-icon">🚫</span>
                <span className="reporte-card-title">Formato 608</span>
              </div>
              <p className="reporte-card-desc">Comprobantes Anulados</p>
              <span className="reporte-card-count">{resumen.formato_608.registros} registros</span>
              <button
                className="reporte-card-btn"
                onClick={() => handleDescargar('608')}
                disabled={resumen.formato_608.registros === 0}
              >
                Descargar TXT
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default Reportes;
