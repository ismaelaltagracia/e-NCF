import { useState, useRef } from 'react';
import './FacturasBatch.css';

interface ValidationRow {
  fila: number;
  valido: boolean;
  errores: string[];
}

interface ValidationResult {
  total_filas: number;
  filas_validas: number;
  filas_con_errores: number;
  facturas_detectadas: number;
  columnas_detectadas: string[];
  columnas_faltantes: string[];
  estructura_valida: boolean;
  detalle: ValidationRow[];
}

interface EmisionResultado {
  factura: string;
  exito: boolean;
  id?: string;
  e_ncf?: string;
  error?: string;
}

interface EmisionResult {
  total: number;
  exitosas: number;
  fallidas: number;
  resultados: EmisionResultado[];
}

function FacturasBatch() {
  const [file, setFile] = useState<File | null>(null);
  const [validating, setValidating] = useState(false);
  const [emitting, setEmitting] = useState(false);
  const [validation, setValidation] = useState<ValidationResult | null>(null);
  const [emisionResult, setEmisionResult] = useState<EmisionResult | null>(null);
  const [error, setError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const token = localStorage.getItem('access_token');
  const headers = { Authorization: `Bearer ${token}` };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0] || null;
    setFile(selected);
    setValidation(null);
    setEmisionResult(null);
    setError('');
  };

  const handleValidar = async () => {
    if (!file) return;
    setValidating(true);
    setError('');
    setValidation(null);

    try {
      const formData = new FormData();
      formData.append('archivo', file);

      const res = await fetch('/api/v1/facturas/batch/validar', {
        method: 'POST',
        headers,
        body: formData,
      });

      if (!res.ok) {
        const body = await res.json();
        setError(body.message || 'Error al validar archivo');
        return;
      }

      const data: ValidationResult = await res.json();
      setValidation(data);
    } catch {
      setError('Error de conexión');
    } finally {
      setValidating(false);
    }
  };

  const handleEmitir = async () => {
    if (!file) return;
    setEmitting(true);
    setError('');

    try {
      const formData = new FormData();
      formData.append('archivo', file);

      const res = await fetch('/api/v1/facturas/batch/emitir', {
        method: 'POST',
        headers,
        body: formData,
      });

      if (!res.ok) {
        const body = await res.json();
        setError(body.message || 'Error al emitir facturas');
        return;
      }

      const data: EmisionResult = await res.json();
      setEmisionResult(data);
      setValidation(null);
    } catch {
      setError('Error de conexión');
    } finally {
      setEmitting(false);
    }
  };

  const handleDescargarPlantilla = async () => {
    try {
      const res = await fetch('/api/v1/facturas/batch/plantilla', { headers });
      if (!res.ok) {
        setError('Error al descargar plantilla');
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'plantilla-facturas.xlsx';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      setError('Error al descargar plantilla');
    }
  };

  const handleReset = () => {
    setFile(null);
    setValidation(null);
    setEmisionResult(null);
    setError('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <div className="batch">
      <div className="batch-header">
        <div>
          <h2>Carga masiva de facturas</h2>
          <p>Suba un archivo Excel o CSV para emitir múltiples facturas a la vez.</p>
        </div>
        <button className="batch-btn-plantilla" onClick={handleDescargarPlantilla}>
          📥 Descargar plantilla
        </button>
      </div>

      {/* Upload area */}
      <div className="batch-upload">
        <div className="batch-upload-area">
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            onChange={handleFileChange}
            id="batch-file"
          />
          <label htmlFor="batch-file" className="batch-upload-label">
            {file ? (
              <>📄 {file.name} ({(file.size / 1024).toFixed(1)} KB)</>
            ) : (
              <>📁 Seleccionar archivo (.xlsx, .csv)</>
            )}
          </label>
          <p className="batch-upload-hint">Máximo 5MB. Use la plantilla para asegurar el formato correcto.</p>
        </div>

        {file && !emisionResult && (
          <div className="batch-actions">
            <button
              className="batch-btn-validar"
              onClick={handleValidar}
              disabled={validating}
            >
              {validating ? 'Validando...' : '🔍 Validar archivo'}
            </button>
            {validation && validation.estructura_valida && validation.filas_validas > 0 && (
              <button
                className="batch-btn-emitir"
                onClick={handleEmitir}
                disabled={emitting}
              >
                {emitting ? 'Emitiendo...' : `🚀 Emitir ${validation.facturas_detectadas} facturas (${validation.filas_validas} ítems)`}
              </button>
            )}
          </div>
        )}
      </div>

      {error && (
        <div className="batch-error" role="alert">{error}</div>
      )}

      {/* Validation results */}
      {validation && (
        <div className="batch-validation">
          {!validation.estructura_valida ? (
            <div className="batch-structure-error">
              <h3>❌ Estructura inválida</h3>
              <p>El archivo no contiene las columnas requeridas.</p>
              <p><strong>Columnas faltantes:</strong> {validation.columnas_faltantes.join(', ')}</p>
              <p><strong>Columnas detectadas:</strong> {validation.columnas_detectadas.join(', ')}</p>
              <p>Descargue la plantilla para ver el formato correcto.</p>
            </div>
          ) : (
            <>
              <div className="batch-summary">
                <div className="batch-stat">
                  <span className="batch-stat-value">{validation.total_filas}</span>
                  <span className="batch-stat-label">Total filas</span>
                </div>
                <div className="batch-stat batch-stat--success">
                  <span className="batch-stat-value">{validation.filas_validas}</span>
                  <span className="batch-stat-label">Filas válidas</span>
                </div>
                <div className="batch-stat batch-stat--error">
                  <span className="batch-stat-value">{validation.filas_con_errores}</span>
                  <span className="batch-stat-label">Con errores</span>
                </div>
                <div className="batch-stat">
                  <span className="batch-stat-value">{validation.facturas_detectadas}</span>
                  <span className="batch-stat-label">Facturas a emitir</span>
                </div>
              </div>

              {validation.filas_con_errores > 0 && (
                <div className="batch-errors-table">
                  <h4>Filas con errores</h4>
                  <table>
                    <thead>
                      <tr>
                        <th>Fila</th>
                        <th>Errores</th>
                      </tr>
                    </thead>
                    <tbody>
                      {validation.detalle
                        .filter((d) => !d.valido)
                        .slice(0, 50)
                        .map((d) => (
                          <tr key={d.fila}>
                            <td>{d.fila}</td>
                            <td>{d.errores.join('; ')}</td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                  {validation.filas_con_errores > 50 && (
                    <p className="batch-truncated">Mostrando primeras 50 filas con errores.</p>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Emission results */}
      {emisionResult && (
        <div className="batch-result">
          <div className="batch-summary">
            <div className="batch-stat">
              <span className="batch-stat-value">{emisionResult.total}</span>
              <span className="batch-stat-label">Total facturas</span>
            </div>
            <div className="batch-stat batch-stat--success">
              <span className="batch-stat-value">{emisionResult.exitosas}</span>
              <span className="batch-stat-label">Exitosas</span>
            </div>
            <div className="batch-stat batch-stat--error">
              <span className="batch-stat-value">{emisionResult.fallidas}</span>
              <span className="batch-stat-label">Fallidas</span>
            </div>
          </div>

          <table className="batch-results-table">
            <thead>
              <tr>
                <th>Factura</th>
                <th>Estado</th>
                <th>No. Comprobante</th>
                <th>Detalle</th>
              </tr>
            </thead>
            <tbody>
              {emisionResult.resultados.map((r) => (
                <tr key={r.factura} className={r.exito ? 'row-success' : 'row-error'}>
                  <td>{r.factura}</td>
                  <td>{r.exito ? '✅' : '❌'}</td>
                  <td>{r.e_ncf || '—'}</td>
                  <td>{r.exito ? r.id?.substring(0, 8) : r.error}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <button className="batch-btn-reset" onClick={handleReset}>
            Cargar otro archivo
          </button>
        </div>
      )}
    </div>
  );
}

export default FacturasBatch;
