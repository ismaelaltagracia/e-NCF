import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import Swal from 'sweetalert2';
import './FacturasLista.css';

interface Factura {
  id: string;
  e_ncf: string;
  track_id: string | null;
  estado_dgii: string;
  payload_json: {
    rnc_receptor?: string;
    nombre_receptor?: string;
    monto_total?: number;
    subtotal?: number;
    monto_itbis?: number;
    items?: Array<{ descripcion: string; cantidad: number; precio_unitario: number; tasa_itbis: number }>;
  };
  xml_s3_url: string | null;
  pdf_s3_url: string | null;
  created_at: string;
}

interface PaginatedResponse {
  data: Factura[];
  total: number;
  page: number;
  limit: number;
}

function getAccessToken(): string {
  return localStorage.getItem('access_token') || '';
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('es-DO', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatCurrency(value: number | undefined): string {
  if (value === undefined) return '-';
  return `RD$ ${value.toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function FacturasLista() {
  const [facturas, setFacturas] = useState<Factura[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [filtroEstado, setFiltroEstado] = useState('');
  const [filtroTipo, setFiltroTipo] = useState('');
  const [filtroRnc, setFiltroRnc] = useState('');
  const [filtroDesde, setFiltroDesde] = useState('');
  const [filtroHasta, setFiltroHasta] = useState('');
  const [filtroEncf, setFiltroEncf] = useState('');
  const [filtroAmbiente, setFiltroAmbiente] = useState('');
  const limit = 10;

  const fetchFacturas = useCallback(async (p: number) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(p), limit: String(limit) });
      if (filtroEstado) params.set('estado_dgii', filtroEstado);
      if (filtroTipo) params.set('tipo_comprobante', filtroTipo);
      if (filtroRnc) params.set('rnc_receptor', filtroRnc);
      if (filtroDesde) params.set('fecha_desde', filtroDesde);
      if (filtroHasta) params.set('fecha_hasta', filtroHasta);
      if (filtroEncf) params.set('e_ncf', filtroEncf);
      if (filtroAmbiente) params.set('ambiente', filtroAmbiente);

      const res = await fetch(`/api/v1/facturas?${params.toString()}`, {
        headers: { Authorization: `Bearer ${getAccessToken()}` },
      });
      if (res.ok) {
        const data: PaginatedResponse = await res.json();
        setFacturas(data.data || []);
        setTotal(data.total || 0);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [filtroEstado, filtroTipo, filtroRnc, filtroDesde, filtroHasta, filtroEncf, filtroAmbiente]);

  useEffect(() => {
    fetchFacturas(page);
  }, [page, fetchFacturas]);

  const handleFilter = () => {
    setPage(1);
    fetchFacturas(1);
  };

  const handleClearFilters = () => {
    setFiltroEstado('');
    setFiltroTipo('');
    setFiltroRnc('');
    setFiltroDesde('');
    setFiltroHasta('');
    setFiltroEncf('');
    setFiltroAmbiente('');
    setPage(1);
  };

  const totalPages = Math.ceil(total / limit);

  return (
    <div className="facturas-lista">
      <div className="facturas-lista-header">
        <h2>Historial de Facturas</h2>
        <Link to="/facturas/nueva" className="facturas-lista-btn-new">
          + Nueva Factura
        </Link>
      </div>

      {/* Filtros */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '0.75rem', marginBottom: '1.5rem', padding: '1rem', backgroundColor: '#f8f9fa', borderRadius: '8px' }}>
        <div>
          <label style={{ fontSize: '0.75rem', color: '#5f6368', display: 'block', marginBottom: '0.25rem' }}>Estado</label>
          <select value={filtroEstado} onChange={(e) => setFiltroEstado(e.target.value)} style={{ width: '100%', padding: '0.4rem', borderRadius: '4px', border: '1px solid #dadce0', fontSize: '0.8rem' }}>
            <option value="">Todos</option>
            <option value="enviado">Enviado</option>
            <option value="aceptado">Aceptado</option>
            <option value="aprobado">Aprobado</option>
            <option value="rechazado">Rechazado</option>
            <option value="reintentando">Reintentando</option>
            <option value="fallido">Fallido</option>
            <option value="anulado">Anulado</option>
          </select>
        </div>
        <div>
          <label style={{ fontSize: '0.75rem', color: '#5f6368', display: 'block', marginBottom: '0.25rem' }}>Ambiente</label>
          <select value={filtroAmbiente} onChange={(e) => setFiltroAmbiente(e.target.value)} style={{ width: '100%', padding: '0.4rem', borderRadius: '4px', border: '1px solid #dadce0', fontSize: '0.8rem' }}>
            <option value="">Actual</option>
            <option value="certificacion">Certificación</option>
            <option value="produccion">Producción</option>
          </select>
        </div>
        <div>
          <label style={{ fontSize: '0.75rem', color: '#5f6368', display: 'block', marginBottom: '0.25rem' }}>Tipo Comprobante</label>
          <select value={filtroTipo} onChange={(e) => setFiltroTipo(e.target.value)} style={{ width: '100%', padding: '0.4rem', borderRadius: '4px', border: '1px solid #dadce0', fontSize: '0.8rem' }}>
            <option value="">Todos</option>
            <option value="E31">E31 - Crédito Fiscal</option>
            <option value="E32">E32 - Consumo</option>
            <option value="E33">E33 - Nota Débito</option>
            <option value="E34">E34 - Nota Crédito</option>
            <option value="E41">E41 - Compras</option>
            <option value="E43">E43 - Gastos Menores</option>
            <option value="E44">E44 - Reg. Especiales</option>
            <option value="E45">E45 - Gubernamental</option>
            <option value="E46">E46 - Exportaciones</option>
          </select>
        </div>
        <div>
          <label style={{ fontSize: '0.75rem', color: '#5f6368', display: 'block', marginBottom: '0.25rem' }}>RNC Receptor</label>
          <input type="text" value={filtroRnc} onChange={(e) => setFiltroRnc(e.target.value)} placeholder="9 u 11 dígitos" maxLength={11} style={{ width: '100%', padding: '0.4rem', borderRadius: '4px', border: '1px solid #dadce0', fontSize: '0.8rem' }} />
        </div>
        <div>
          <label style={{ fontSize: '0.75rem', color: '#5f6368', display: 'block', marginBottom: '0.25rem' }}>e-NCF</label>
          <input type="text" value={filtroEncf} onChange={(e) => setFiltroEncf(e.target.value)} placeholder="Ej: E31000000" style={{ width: '100%', padding: '0.4rem', borderRadius: '4px', border: '1px solid #dadce0', fontSize: '0.8rem' }} />
        </div>
        <div>
          <label style={{ fontSize: '0.75rem', color: '#5f6368', display: 'block', marginBottom: '0.25rem' }}>Desde</label>
          <input type="date" value={filtroDesde} onChange={(e) => setFiltroDesde(e.target.value)} style={{ width: '100%', padding: '0.4rem', borderRadius: '4px', border: '1px solid #dadce0', fontSize: '0.8rem' }} />
        </div>
        <div>
          <label style={{ fontSize: '0.75rem', color: '#5f6368', display: 'block', marginBottom: '0.25rem' }}>Hasta</label>
          <input type="date" value={filtroHasta} onChange={(e) => setFiltroHasta(e.target.value)} style={{ width: '100%', padding: '0.4rem', borderRadius: '4px', border: '1px solid #dadce0', fontSize: '0.8rem' }} />
        </div>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: '0.5rem' }}>
          <button onClick={handleFilter} style={{ padding: '0.4rem 0.8rem', backgroundColor: '#1a73e8', color: '#fff', border: 'none', borderRadius: '4px', fontSize: '0.8rem', cursor: 'pointer' }}>Filtrar</button>
          <button onClick={handleClearFilters} style={{ padding: '0.4rem 0.8rem', backgroundColor: '#fff', color: '#5f6368', border: '1px solid #dadce0', borderRadius: '4px', fontSize: '0.8rem', cursor: 'pointer' }}>Limpiar</button>
        </div>
      </div>

      {loading ? (
        <p>Cargando facturas...</p>
      ) : facturas.length === 0 ? (
        <div className="facturas-lista-empty">
          <p>No hay facturas emitidas aún.</p>
          <Link to="/facturas/nueva" className="facturas-lista-btn-new" style={{ display: 'inline-block', marginTop: '1rem' }}>
            Crear primera factura
          </Link>
        </div>
      ) : (
        <>
          <table className="facturas-tabla">
            <thead>
              <tr>
                <th>Fecha</th>
                <th>e-NCF</th>
                <th>Receptor</th>
                <th>Monto</th>
                <th>Estado DGII</th>
              </tr>
            </thead>
            <tbody>
              {facturas.map((f) => (
                <>
                  <tr
                    key={f.id}
                    className={expandedId === f.id ? 'expanded' : ''}
                    onClick={() => setExpandedId(expandedId === f.id ? null : f.id)}
                    style={{ cursor: 'pointer' }}
                  >
                    <td>{formatDate(f.created_at)}</td>
                    <td><code>{f.e_ncf || '-'}</code></td>
                    <td>
                      {f.payload_json?.nombre_receptor || f.payload_json?.rnc_receptor || '-'}
                    </td>
                    <td>{formatCurrency(f.payload_json?.monto_total)}</td>
                    <td>
                      <span className={`estado-badge ${f.estado_dgii}`}>
                        {f.estado_dgii.replace('_', ' ')}
                      </span>
                    </td>
                  </tr>
                  {expandedId === f.id && (
                    <tr key={`${f.id}-detail`}>
                      <td colSpan={5}>
                        <FacturaDetalle factura={f} onRefresh={() => fetchFacturas(page)} />
                      </td>
                    </tr>
                  )}
                </>
              ))}
            </tbody>
          </table>

          {totalPages > 0 && (
            <div className="facturas-pagination">
              <button onClick={() => setPage(page - 1)} disabled={page <= 1}>
                ← Anterior
              </button>
              <span>Página {page} de {totalPages || 1} ({total} facturas)</span>
              <button onClick={() => setPage(page + 1)} disabled={page >= totalPages}>
                Siguiente →
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function FacturaDetalle({ factura, onRefresh }: { factura: Factura; onRefresh: () => void }) {
  const [pdfLoading, setPdfLoading] = useState(false);
  const [emailLoading, setEmailLoading] = useState(false);
  const [emailSent, setEmailSent] = useState(false);
  const [emailTo, setEmailTo] = useState('');
  const [showEmailForm, setShowEmailForm] = useState(false);
  const [mensaje, setMensaje] = useState('');

  const handleDescargarPdf = async () => {
    setPdfLoading(true);
    setMensaje('');
    try {
      const res = await fetch(`/api/v1/facturas/${factura.id}/pdf`, {
        headers: { Authorization: `Bearer ${getAccessToken()}` },
      });
      if (res.ok) {
        const data = await res.json();
        if (data.url) {
          window.open(data.url, '_blank');
        } else {
          setMensaje('PDF aún no disponible. Intente más tarde.');
        }
      } else {
        const body = await res.json();
        setMensaje(body.message || 'Error al obtener PDF');
      }
    } catch {
      setMensaje('Error de conexión');
    } finally {
      setPdfLoading(false);
    }
  };

  const handleEnviarCorreo = async () => {
    if (!emailTo.trim()) return;
    setEmailLoading(true);
    setMensaje('');
    try {
      const res = await fetch(`/api/v1/facturas/${factura.id}/enviar-email`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${getAccessToken()}`,
        },
        body: JSON.stringify({ email: emailTo.trim() }),
      });
      if (res.ok) {
        setEmailSent(true);
        setMensaje('Correo enviado exitosamente');
        setShowEmailForm(false);
      } else {
        const body = await res.json();
        setMensaje(body.message || 'Error al enviar correo');
      }
    } catch {
      setMensaje('Error de conexión');
    } finally {
      setEmailLoading(false);
    }
  };

  return (
    <div className="facturas-detalle">
      <div className="facturas-detalle-grid">
        <div className="facturas-detalle-item">
          <span className="facturas-detalle-label">ID</span>
          <span className="facturas-detalle-value">{factura.id}</span>
        </div>
        <div className="facturas-detalle-item">
          <span className="facturas-detalle-label">Track ID</span>
          <span className="facturas-detalle-value">{factura.track_id || 'Pendiente'}</span>
        </div>
        <div className="facturas-detalle-item">
          <span className="facturas-detalle-label">RNC Receptor</span>
          <span className="facturas-detalle-value">{factura.payload_json?.rnc_receptor || '-'}</span>
        </div>
        <div className="facturas-detalle-item">
          <span className="facturas-detalle-label">Subtotal</span>
          <span className="facturas-detalle-value">{formatCurrency(factura.payload_json?.subtotal)}</span>
        </div>
        <div className="facturas-detalle-item">
          <span className="facturas-detalle-label">ITBIS</span>
          <span className="facturas-detalle-value">{formatCurrency(factura.payload_json?.monto_itbis)}</span>
        </div>
        <div className="facturas-detalle-item">
          <span className="facturas-detalle-label">Total</span>
          <span className="facturas-detalle-value">{formatCurrency(factura.payload_json?.monto_total)}</span>
        </div>
      </div>

      {factura.payload_json?.items && factura.payload_json.items.length > 0 && (
        <div style={{ marginTop: '1rem' }}>
          <span className="facturas-detalle-label">Ítems:</span>
          <table className="facturas-tabla" style={{ marginTop: '0.5rem', fontSize: '0.8rem' }}>
            <thead>
              <tr>
                <th>Descripción</th>
                <th>Cant.</th>
                <th>Precio</th>
                <th>ITBIS</th>
              </tr>
            </thead>
            <tbody>
              {factura.payload_json.items.map((item, i) => (
                <tr key={i}>
                  <td>{item.descripcion}</td>
                  <td>{item.cantidad}</td>
                  <td>{formatCurrency(item.precio_unitario)}</td>
                  <td>{item.tasa_itbis}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Acciones */}
      <div style={{ marginTop: '1rem', display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
        <button
          onClick={handleDescargarPdf}
          disabled={pdfLoading}
          style={{ padding: '0.4rem 0.8rem', backgroundColor: '#1a73e8', color: '#fff', border: 'none', borderRadius: '4px', fontSize: '0.8rem', cursor: 'pointer' }}
        >
          {pdfLoading ? 'Generando...' : '📄 Descargar PDF'}
        </button>

        {!showEmailForm ? (
          <button
            onClick={() => setShowEmailForm(true)}
            disabled={emailSent}
            style={{ padding: '0.4rem 0.8rem', backgroundColor: '#34a853', color: '#fff', border: 'none', borderRadius: '4px', fontSize: '0.8rem', cursor: 'pointer' }}
          >
            {emailSent ? '✓ Enviado' : '✉ Enviar por correo'}
          </button>
        ) : (
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            <input
              type="email"
              value={emailTo}
              onChange={(e) => setEmailTo(e.target.value)}
              placeholder="correo@destino.com"
              style={{ padding: '0.4rem', borderRadius: '4px', border: '1px solid #dadce0', fontSize: '0.8rem', width: '200px' }}
            />
            <button
              onClick={handleEnviarCorreo}
              disabled={emailLoading || !emailTo.trim()}
              style={{ padding: '0.4rem 0.8rem', backgroundColor: '#34a853', color: '#fff', border: 'none', borderRadius: '4px', fontSize: '0.8rem', cursor: 'pointer' }}
            >
              {emailLoading ? 'Enviando...' : 'Enviar'}
            </button>
            <button
              onClick={() => setShowEmailForm(false)}
              style={{ padding: '0.4rem 0.8rem', backgroundColor: '#fff', color: '#5f6368', border: '1px solid #dadce0', borderRadius: '4px', fontSize: '0.8rem', cursor: 'pointer' }}
            >
              Cancelar
            </button>
          </div>
        )}

        {factura.estado_dgii === 'aprobado' && (
          <button
            onClick={async () => {
              const result = await Swal.fire({
                title: '¿Anular esta factura?',
                text: 'Esta acción no se puede deshacer. El e-NCF no será liberado.',
                input: 'textarea',
                inputLabel: 'Motivo de anulación',
                inputPlaceholder: 'Escriba el motivo...',
                inputValidator: (value) => {
                  if (!value || !value.trim()) return 'Debe indicar un motivo';
                  return null;
                },
                icon: 'warning',
                showCancelButton: true,
                confirmButtonColor: '#d93025',
                confirmButtonText: 'Sí, anular',
                cancelButtonText: 'Cancelar',
              });
              if (!result.isConfirmed || !result.value) return;
              try {
                const res = await fetch(`/api/v1/facturas/${factura.id}/anular`, {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${getAccessToken()}`,
                  },
                  body: JSON.stringify({ motivo: result.value }),
                });
                if (res.ok) {
                  await Swal.fire('Anulada', 'La factura ha sido anulada exitosamente.', 'success');
                  onRefresh();
                } else {
                  const body = await res.json();
                  await Swal.fire('Error', body.message || 'Error al anular factura', 'error');
                }
              } catch {
                await Swal.fire('Error', 'Error de conexión', 'error');
              }
            }}
            style={{ padding: '0.4rem 0.8rem', backgroundColor: '#d93025', color: '#fff', border: 'none', borderRadius: '4px', fontSize: '0.8rem', cursor: 'pointer' }}
          >
            🚫 Anular
          </button>
        )}
      </div>

      {mensaje && (
        <div style={{ marginTop: '0.5rem', fontSize: '0.8rem', color: mensaje.includes('Error') ? '#d93025' : '#1e8e3e' }}>
          {mensaje}
        </div>
      )}
    </div>
  );
}

export default FacturasLista;
