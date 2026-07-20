import { useState, useCallback, useEffect } from 'react';
import Swal from 'sweetalert2';
import './Certificacion.css';

// ─── Types ────────────────────────────────────────────────────────────────────

interface PasoResultado {
  paso: number;
  nombre: string;
  estado: 'exitoso' | 'fallido' | 'omitido' | 'pendiente';
  mensaje?: string;
  e_ncf?: string;
  track_id?: string | null;
  error?: string;
}

interface EjecucionResponse {
  ejecutado_en: string;
  duracion_ms: number;
  resumen: {
    exitosos: number;
    fallidos: number;
    omitidos: number;
  };
  pasos: PasoResultado[];
}

interface PasoIntegrador {
  paso: number;
  nombre: string;
  completado: boolean;
  factura_id?: string;
  e_ncf?: string;
  completado_en?: string;
  requisito?: string;
}

interface ProgresoIntegradorResponse {
  modo: 'integrador';
  progreso: number;
  total: number;
  porcentaje: number;
  pasos: PasoIntegrador[];
}

type ModoTab = 'empresa' | 'integrador';

// ─── Constants ────────────────────────────────────────────────────────────────

const PASOS_INICIALES: PasoResultado[] = [
  { paso: 1, nombre: 'E31 Factura Crédito Fiscal (básica)', estado: 'pendiente' },
  { paso: 2, nombre: 'E31 Factura Crédito Fiscal (múltiples ítems)', estado: 'pendiente' },
  { paso: 3, nombre: 'E31 Factura Crédito Fiscal (con descuento)', estado: 'pendiente' },
  { paso: 4, nombre: 'E32 Factura de Consumo', estado: 'pendiente' },
  { paso: 5, nombre: 'E32 Factura de Consumo (con ITBIS)', estado: 'pendiente' },
  { paso: 6, nombre: 'E33 Nota de Débito', estado: 'pendiente' },
  { paso: 7, nombre: 'E34 Nota de Crédito', estado: 'pendiente' },
  { paso: 8, nombre: 'E41 Comprobante de Compras', estado: 'pendiente' },
  { paso: 9, nombre: 'E43 Gastos Menores', estado: 'pendiente' },
  { paso: 10, nombre: 'E44 Regímenes Especiales', estado: 'pendiente' },
  { paso: 11, nombre: 'E45 Gubernamental', estado: 'pendiente' },
  { paso: 12, nombre: 'Anulación de e-CF', estado: 'pendiente' },
  { paso: 13, nombre: 'Consulta Estado (Track ID)', estado: 'pendiente' },
  { paso: 14, nombre: 'Aprobación Comercial', estado: 'pendiente' },
  { paso: 15, nombre: 'Consulta de Rangos NCF', estado: 'pendiente' },
];

function getAccessToken(): string {
  return localStorage.getItem('access_token') || '';
}

// ─── Component ────────────────────────────────────────────────────────────────

function Certificacion() {
  const [modoActivo, setModoActivo] = useState<ModoTab>('empresa');

  // Modo Empresa state
  const [pasos, setPasos] = useState<PasoResultado[]>(PASOS_INICIALES);
  const [ejecutando, setEjecutando] = useState(false);
  const [progreso, setProgreso] = useState(0);
  const [resultado, setResultado] = useState<EjecucionResponse | null>(null);
  const [animatingStep, setAnimatingStep] = useState<number | null>(null);

  // Modo Integrador state
  const [progresoIntegrador, setProgresoIntegrador] = useState<ProgresoIntegradorResponse | null>(null);
  const [cargandoIntegrador, setCargandoIntegrador] = useState(false);

  // ─── Modo Integrador Logic ──────────────────────────────────────────────────

  const fetchProgresoIntegrador = useCallback(async () => {
    setCargandoIntegrador(true);
    try {
      const res = await fetch('/api/v1/certificacion/progreso-integrador', {
        headers: { Authorization: `Bearer ${getAccessToken()}` },
      });
      if (res.ok) {
        const data: ProgresoIntegradorResponse = await res.json();
        setProgresoIntegrador(data);
      }
    } catch {
      // silently fail
    } finally {
      setCargandoIntegrador(false);
    }
  }, []);

  useEffect(() => {
    if (modoActivo === 'integrador') {
      fetchProgresoIntegrador();
    }
  }, [modoActivo, fetchProgresoIntegrador]);

  // ─── Modo Empresa Logic ─────────────────────────────────────────────────────

  const ejecutarPruebas = useCallback(async () => {
    // Paso 1: Validar que existan las secuencias NCF necesarias
    try {
      const validRes = await fetch('/api/v1/certificacion/validar', {
        headers: { Authorization: `Bearer ${getAccessToken()}` },
      });
      if (validRes.ok) {
        const validacion = await validRes.json();
        if (!validacion.valido) {
          const tipos = validacion.secuencias_faltantes.map((f: { tipo: string }) => f.tipo).join(', ');
          const crearResult = await Swal.fire({
            title: 'Secuencias NCF Faltantes',
            html: `
              <p>Para ejecutar las 15 pruebas necesitas secuencias NCF de los siguientes tipos:</p>
              <p style="margin-top: 0.5rem; font-weight: bold; color: #d93025;">${tipos}</p>
              <p style="margin-top: 0.75rem; font-size: 0.85rem; color: #5f6368;">
                <strong>Opción 1 (recomendado):</strong> Registre las secuencias asignadas por la DGII en la sección "NCF".
              </p>
              <p style="margin-top: 0.5rem; font-size: 0.85rem; color: #5f6368;">
                <strong>Opción 2 (solo pruebas internas):</strong> Crear secuencias temporales automáticas.
              </p>
            `,
            icon: 'warning',
            showCancelButton: true,
            showDenyButton: true,
            confirmButtonColor: '#1a73e8',
            confirmButtonText: 'Crear temporales y continuar',
            denyButtonText: 'Ir a registrar NCF',
            cancelButtonText: 'Cancelar',
          });

          if (crearResult.isDenied) {
            window.location.href = '/app/secuencias-ncf';
            return;
          }
          if (!crearResult.isConfirmed) return;

          // Crear secuencias faltantes
          const prepRes = await fetch('/api/v1/certificacion/preparar', {
            method: 'POST',
            headers: { Authorization: `Bearer ${getAccessToken()}` },
          });
          if (prepRes.ok) {
            const prep = await prepRes.json();
            await Swal.fire({
              title: 'Secuencias Creadas',
              text: `Se crearon las secuencias: ${prep.creadas.join(', ')}`,
              icon: 'success',
              timer: 2000,
              showConfirmButton: false,
            });
          } else {
            const body = await prepRes.json();
            await Swal.fire('Error', body.message || 'No se pudieron crear las secuencias', 'error');
            return;
          }
        }
      }
    } catch {
      // Si la validación falla, intentar ejecutar de todos modos
    }

    // Paso 2: Confirmar ejecución
    const confirmacion = await Swal.fire({
      title: '¿Ejecutar Set de Pruebas?',
      html: `
        <p>Se ejecutarán los <strong>15 pasos</strong> del set de pruebas de certificación DGII.</p>
        <p style="margin-top: 0.5rem; color: #5f6368; font-size: 0.9rem;">
          Esto creará facturas de prueba y consumirá secuencias NCF.
        </p>
      `,
      icon: 'question',
      showCancelButton: true,
      confirmButtonColor: '#1e8e3e',
      confirmButtonText: '▶ Ejecutar',
      cancelButtonText: 'Cancelar',
    });

    if (!confirmacion.isConfirmed) return;

    setEjecutando(true);
    setProgreso(0);
    setResultado(null);
    setPasos(PASOS_INICIALES.map((p) => ({ ...p, estado: 'pendiente' })));

    try {
      const res = await fetch('/api/v1/certificacion/ejecutar', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${getAccessToken()}`,
        },
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message || `Error ${res.status}`);
      }

      const data: EjecucionResponse = await res.json();
      setResultado(data);

      // Animate through each step with a delay
      for (let i = 0; i < data.pasos.length; i++) {
        await new Promise((resolve) => setTimeout(resolve, 200));
        setAnimatingStep(data.pasos[i].paso);
        setPasos((prev) =>
          prev.map((p) =>
            p.paso === data.pasos[i].paso ? { ...data.pasos[i] } : p,
          ),
        );
        setProgreso(Math.round(((i + 1) / data.pasos.length) * 100));
      }

      // Clear animation highlight after last step
      setTimeout(() => setAnimatingStep(null), 300);

      // Show summary
      await Swal.fire({
        title: 'Set de Pruebas Completado',
        html: `
          <div style="text-align: left; font-size: 0.9rem;">
            <p>✅ Exitosos: <strong>${data.resumen.exitosos}</strong></p>
            <p>❌ Fallidos: <strong>${data.resumen.fallidos}</strong></p>
            <p>⚠️ Omitidos: <strong>${data.resumen.omitidos}</strong></p>
            <p style="margin-top: 0.75rem; color: #5f6368;">
              Duración: ${(data.duracion_ms / 1000).toFixed(1)}s
            </p>
          </div>
        `,
        icon: data.resumen.fallidos === 0 ? 'success' : 'warning',
        confirmButtonColor: '#1a73e8',
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Error desconocido';
      await Swal.fire({
        title: 'Error',
        text: msg,
        icon: 'error',
        confirmButtonColor: '#d93025',
      });
    } finally {
      setEjecutando(false);
    }
  }, []);

  const reiniciar = () => {
    setPasos(PASOS_INICIALES.map((p) => ({ ...p, estado: 'pendiente' })));
    setProgreso(0);
    setResultado(null);
    setAnimatingStep(null);
  };

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="certificacion">
      <div className="certificacion-header">
        <h2>Set de Pruebas DGII - Certificación</h2>
        <p>
          Complete los 15 pasos requeridos por la DGII para el proceso de certificación
          como emisor de comprobantes fiscales electrónicos (e-CF).
        </p>
      </div>

      {/* Tab bar */}
      <div className="certificacion-tabs">
        <button
          className={`certificacion-tab ${modoActivo === 'empresa' ? 'active' : ''}`}
          onClick={() => setModoActivo('empresa')}
        >
          🏢 Modo Empresa
        </button>
        <button
          className={`certificacion-tab ${modoActivo === 'integrador' ? 'active' : ''}`}
          onClick={() => setModoActivo('integrador')}
        >
          🔗 Modo Integrador
        </button>
      </div>

      {/* Modo Empresa content */}
      {modoActivo === 'empresa' && (
        <div className="certificacion-content">
          <p className="certificacion-modo-desc">
            Ejecute los 15 pasos automáticamente. El sistema creará facturas de prueba y consumirá secuencias NCF.
          </p>

          <div className="certificacion-actions">
            <button
              className="certificacion-btn-ejecutar"
              onClick={ejecutarPruebas}
              disabled={ejecutando}
            >
              {ejecutando ? '⏳ Ejecutando...' : '▶ Ejecutar Set de Pruebas'}
            </button>
            {resultado && !ejecutando && (
              <button
                className="certificacion-btn-reiniciar"
                onClick={reiniciar}
              >
                🔄 Reiniciar
              </button>
            )}
          </div>

          {(ejecutando || progreso > 0) && (
            <div className="certificacion-progress-section">
              <div className="certificacion-progress-bar-container">
                <div
                  className="certificacion-progress-bar"
                  style={{ width: `${progreso}%` }}
                />
              </div>
              <span className="certificacion-progress-text">
                {ejecutando
                  ? `Ejecutando... ${progreso}% completado`
                  : `${progreso}% completado`}
              </span>
            </div>
          )}

          {resultado && !ejecutando && (
            <div className="certificacion-resumen">
              <div className="certificacion-resumen-item exitosos">
                <span className="count">{resultado.resumen.exitosos}</span>
                <span>Exitosos</span>
              </div>
              <div className="certificacion-resumen-item fallidos">
                <span className="count">{resultado.resumen.fallidos}</span>
                <span>Fallidos</span>
              </div>
              <div className="certificacion-resumen-item omitidos">
                <span className="count">{resultado.resumen.omitidos}</span>
                <span>Omitidos</span>
              </div>
              <span className="certificacion-duracion">
                ⏱ {(resultado.duracion_ms / 1000).toFixed(1)}s
              </span>
            </div>
          )}

          <table className="certificacion-tabla">
            <thead>
              <tr>
                <th>#</th>
                <th>Paso</th>
                <th>Estado</th>
                <th>e-NCF</th>
                <th>Track ID</th>
                <th>Detalle</th>
              </tr>
            </thead>
            <tbody>
              {pasos.map((paso) => (
                <tr
                  key={paso.paso}
                  className={animatingStep === paso.paso ? 'animating' : ''}
                >
                  <td className="certificacion-paso-numero">{paso.paso}</td>
                  <td>{paso.nombre}</td>
                  <td>
                    <span className={`certificacion-estado-badge ${paso.estado}`}>
                      {paso.estado}
                    </span>
                  </td>
                  <td>
                    {paso.e_ncf ? (
                      <span className="certificacion-encf">{paso.e_ncf}</span>
                    ) : (
                      '-'
                    )}
                  </td>
                  <td>
                    {paso.track_id ? (
                      <span className="certificacion-track-id">{paso.track_id}</span>
                    ) : (
                      '-'
                    )}
                  </td>
                  <td>
                    {paso.error ? (
                      <span className="certificacion-error" title={paso.error}>
                        {paso.error.length > 60
                          ? `${paso.error.substring(0, 60)}...`
                          : paso.error}
                      </span>
                    ) : paso.mensaje ? (
                      <span style={{ fontSize: '0.75rem', color: '#5f6368' }}>
                        {paso.mensaje.length > 60
                          ? `${paso.mensaje.substring(0, 60)}...`
                          : paso.mensaje}
                      </span>
                    ) : (
                      '-'
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Modo Integrador content */}
      {modoActivo === 'integrador' && (
        <div className="certificacion-content">
          <div className="certificacion-integrador-info">
            <p>
              📡 Envíe facturas de prueba desde su sistema usando los endpoints del API.
              El progreso se actualizará automáticamente.
            </p>
          </div>

          <div className="certificacion-actions">
            <button
              className="certificacion-btn-actualizar"
              onClick={fetchProgresoIntegrador}
              disabled={cargandoIntegrador}
            >
              {cargandoIntegrador ? '⏳ Cargando...' : '🔄 Actualizar'}
            </button>
          </div>

          {progresoIntegrador && (
            <>
              <div className="certificacion-progress-section">
                <div className="certificacion-progress-bar-container">
                  <div
                    className="certificacion-progress-bar"
                    style={{ width: `${progresoIntegrador.porcentaje}%` }}
                  />
                </div>
                <span className="certificacion-progress-text">
                  {progresoIntegrador.progreso} de {progresoIntegrador.total} pasos completados ({progresoIntegrador.porcentaje}%)
                </span>
              </div>

              <table className="certificacion-tabla">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Paso</th>
                    <th>Estado</th>
                    <th>e-NCF</th>
                    <th>Completado</th>
                    <th>Detalle</th>
                  </tr>
                </thead>
                <tbody>
                  {progresoIntegrador.pasos.map((paso) => (
                    <tr key={paso.paso} className={paso.completado ? 'integrador-completado' : ''}>
                      <td className="certificacion-paso-numero">{paso.paso}</td>
                      <td>{paso.nombre}</td>
                      <td>
                        {paso.completado ? (
                          <span className="certificacion-estado-badge exitoso">✅ completado</span>
                        ) : (
                          <span className="certificacion-estado-badge pendiente">❌ pendiente</span>
                        )}
                      </td>
                      <td>
                        {paso.e_ncf ? (
                          <span className="certificacion-encf">{paso.e_ncf}</span>
                        ) : (
                          '-'
                        )}
                      </td>
                      <td>
                        {paso.completado_en ? (
                          <span style={{ fontSize: '0.75rem', color: '#5f6368' }}>
                            {new Date(paso.completado_en).toLocaleDateString('es-DO', {
                              day: '2-digit',
                              month: 'short',
                              year: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </span>
                        ) : (
                          '-'
                        )}
                      </td>
                      <td>
                        {paso.requisito ? (
                          <span className="certificacion-requisito">{paso.requisito}</span>
                        ) : paso.factura_id ? (
                          <span style={{ fontSize: '0.75rem', color: '#5f6368', fontFamily: 'monospace' }}>
                            {paso.factura_id.substring(0, 8)}...
                          </span>
                        ) : (
                          '-'
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}

          {!progresoIntegrador && !cargandoIntegrador && (
            <div className="certificacion-empty">
              <p>No se pudo cargar el progreso.</p>
              <p>Haga clic en "Actualizar" para reintentar.</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default Certificacion;
