import { useState, useCallback, useEffect, useRef } from 'react';
import './Facturas.css';

/* ---------- Types ---------- */

interface CatalogItem {
  id: string;
  descripcion: string;
  codigo: string;
  precio_unitario: number;
  tasa_itbis: number;
  tipo: string;
}

interface LineItem {
  catalogo_item_id: string;
  descripcion: string;
  cantidad: number;
  precio_unitario: number;
  tasa_itbis: number;
}

interface FieldErrors {
  rnc_receptor?: string;
  nombre_receptor?: string;
  items?: string;
}

interface SuccessResult {
  id: string;
  e_ncf: string;
  track_id: string;
  estado_dgii: string;
  pdf_url?: string;
}

/* ---------- Helpers ---------- */

function getAccessToken(): string {
  return localStorage.getItem('access_token') || '';
}

function getUserRole(): string {
  const token = getAccessToken();
  if (!token) return '';
  try {
    const payload = token.split('.')[1];
    const decoded = JSON.parse(atob(payload));
    return decoded.rol || '';
  } catch {
    return '';
  }
}

function formatCurrency(value: number): string {
  return value.toLocaleString('es-DO', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function calcSubtotal(line: LineItem): number {
  return line.cantidad * line.precio_unitario;
}

function calcItbis(line: LineItem): number {
  return calcSubtotal(line) * (line.tasa_itbis / 100);
}

function validateRnc(rnc: string): boolean {
  return /^\d{9}$|^\d{11}$/.test(rnc);
}

/* ---------- Main Component ---------- */

function Facturas() {
  const role = getUserRole();
  const isReadOnly = role === 'lector';

  const [rncReceptor, setRncReceptor] = useState('');
  const [nombreReceptor, setNombreReceptor] = useState('');
  const [rncLookupLoading, setRncLookupLoading] = useState(false);
  const [lines, setLines] = useState<LineItem[]>([createEmptyLine()]);
  const [tipoComprobante, setTipoComprobante] = useState('E31');
  const [fechaVencimiento, setFechaVencimiento] = useState('');
  const [ncfModificado, setNcfModificado] = useState('');
  const [fechaNcfModificado, setFechaNcfModificado] = useState('');
  const [codigoModificacion, setCodigoModificacion] = useState(1);
  const [descuentoGlobal, setDescuentoGlobal] = useState(0);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [generalError, setGeneralError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState<SuccessResult | null>(null);

  function createEmptyLine(): LineItem {
    return {
      catalogo_item_id: '',
      descripcion: '',
      cantidad: 1,
      precio_unitario: 0,
      tasa_itbis: 18,
    };
  }

  const lookupRnc = useCallback(async (rnc: string) => {
    if (!validateRnc(rnc)) return;
    setRncLookupLoading(true);
    try {
      const token = getAccessToken();
      const res = await fetch(`/api/v1/rnc/${rnc}/validar`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        if (data.nombre_contribuyente) {
          setNombreReceptor(data.nombre_contribuyente);
          setErrors((prev) => ({ ...prev, rnc_receptor: undefined, nombre_receptor: undefined }));
        }
      } else {
        const body = await res.json();
        setErrors((prev) => ({ ...prev, rnc_receptor: body.message || 'RNC no válido' }));
        setNombreReceptor('');
      }
    } catch {
      // Si falla el lookup, el usuario puede escribir el nombre manualmente
    } finally {
      setRncLookupLoading(false);
    }
  }, []);

  const handleAddLine = useCallback(() => {
    setLines((prev) => [...prev, createEmptyLine()]);
  }, []);

  const handleRemoveLine = useCallback((index: number) => {
    setLines((prev) => {
      if (prev.length <= 1) return prev;
      return prev.filter((_, i) => i !== index);
    });
  }, []);

  const handleLineChange = useCallback(
    (index: number, field: keyof LineItem, value: string | number) => {
      setLines((prev) =>
        prev.map((line, i) => (i === index ? { ...line, [field]: value } : line)),
      );
      setErrors((prev) => ({ ...prev, items: undefined }));
    },
    [],
  );

  const handleSelectCatalogItem = useCallback(
    (index: number, item: CatalogItem) => {
      setLines((prev) =>
        prev.map((line, i) =>
          i === index
            ? {
                ...line,
                catalogo_item_id: item.id,
                descripcion: item.descripcion,
                precio_unitario: item.precio_unitario,
                tasa_itbis: item.tasa_itbis,
              }
            : line,
        ),
      );
      setErrors((prev) => ({ ...prev, items: undefined }));
    },
    [],
  );

  const totalSubtotal = lines.reduce((sum, l) => sum + calcSubtotal(l), 0);
  const totalItbis = lines.reduce((sum, l) => sum + calcItbis(l), 0);
  const descuentoMonto = totalSubtotal * (descuentoGlobal / 100);
  const grandTotal = totalSubtotal - descuentoMonto + totalItbis;

  const validate = (): boolean => {
    const newErrors: FieldErrors = {};

    if (!rncReceptor.trim()) {
      newErrors.rnc_receptor = 'RNC receptor requerido';
    } else if (!validateRnc(rncReceptor.trim())) {
      newErrors.rnc_receptor = 'RNC debe tener 9 u 11 dígitos numéricos';
    }

    const validLines = lines.filter(
      (l) => l.catalogo_item_id && l.descripcion && l.cantidad > 0 && l.precio_unitario > 0,
    );
    if (validLines.length < 1) {
      newErrors.items = 'Debe agregar al menos 1 ítem con datos completos';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isReadOnly) return;

    if (!validate()) return;

    setSubmitting(true);
    setGeneralError('');

    try {
      const token = getAccessToken();
      const body: Record<string, unknown> = {
        rnc_receptor: rncReceptor.trim(),
        nombre_receptor: nombreReceptor.trim(),
        tipo_comprobante: tipoComprobante,
        items: lines
          .filter((l) => l.catalogo_item_id && l.cantidad > 0)
          .map((l) => ({
            catalogo_item_id: l.catalogo_item_id,
            descripcion: l.descripcion,
            cantidad: l.cantidad,
            precio_unitario: l.precio_unitario,
            tasa_itbis: l.tasa_itbis,
          })),
      };

      if (descuentoGlobal > 0) {
        body.descuento_global = descuentoGlobal;
      }

      if (fechaVencimiento) {
        body.fecha_vencimiento = fechaVencimiento;
      }

      if ((tipoComprobante === 'E33' || tipoComprobante === 'E34') && ncfModificado) {
        body.informacion_referencia = {
          ncf_modificado: ncfModificado,
          fecha_ncf_modificado: fechaNcfModificado,
          codigo_modificacion: codigoModificacion,
        };
      }

      const res = await fetch('/api/v1/facturas', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const errBody = await res.json();

        if (errBody.errors && Array.isArray(errBody.errors)) {
          const fieldErrors: FieldErrors = {};
          for (const err of errBody.errors) {
            if (err.path === 'rnc_receptor' && !fieldErrors.rnc_receptor) {
              fieldErrors.rnc_receptor = err.message;
            } else if (err.path === 'nombre_receptor' && !fieldErrors.nombre_receptor) {
              fieldErrors.nombre_receptor = err.message;
            } else if (err.path?.startsWith('items') && !fieldErrors.items) {
              fieldErrors.items = err.message;
            }
          }
          if (Object.keys(fieldErrors).length > 0) {
            setErrors(fieldErrors);
          } else {
            setGeneralError(errBody.message || 'Error al crear la factura');
          }
        } else {
          setGeneralError(errBody.message || 'Error al crear la factura');
        }
        return;
      }

      const data = await res.json();

      // Fetch PDF URL
      let pdfUrl: string | undefined;
      try {
        const pdfRes = await fetch(`/api/v1/facturas/${data.id}/pdf`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (pdfRes.ok) {
          const pdfData = await pdfRes.json();
          pdfUrl = pdfData.url;
        }
      } catch {
        // PDF URL not critical
      }

      setSuccess({
        id: data.id,
        e_ncf: data.e_ncf,
        track_id: data.track_id,
        estado_dgii: data.estado_dgii,
        pdf_url: pdfUrl,
      });
    } catch {
      setGeneralError('Error de conexión. Verifique su red e intente nuevamente.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleNewInvoice = () => {
    setSuccess(null);
    setRncReceptor('');
    setNombreReceptor('');
    setLines([createEmptyLine()]);
    setTipoComprobante('E31');
    setFechaVencimiento('');
    setNcfModificado('');
    setFechaNcfModificado('');
    setCodigoModificacion(1);
    setDescuentoGlobal(0);
    setErrors({});
    setGeneralError('');
  };

  if (success) {
    return (
      <div className="facturas">
        <div className="facturas-header">
          <h2>Factura Creada</h2>
        </div>
        <div className="facturas-success" role="status" aria-live="polite">
          <div className="facturas-success-icon" aria-hidden="true" />
          <h3>¡Factura enviada exitosamente!</h3>
          <div className="facturas-success-details">
            <div className="facturas-success-detail">
              <span className="facturas-success-detail-label">Track ID:</span>
              <span className="facturas-success-detail-value">{success.track_id}</span>
            </div>
            <div className="facturas-success-detail">
              <span className="facturas-success-detail-label">No. Comprobante:</span>
              <span className="facturas-success-detail-value">{success.e_ncf}</span>
            </div>
            <div className="facturas-success-detail">
              <span className="facturas-success-detail-label">Estado DGII:</span>
              <span className="facturas-success-detail-value">{success.estado_dgii}</span>
            </div>
          </div>
          {success.pdf_url && (
            <a
              href={success.pdf_url}
              className="facturas-success-link"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Descargar PDF de la factura"
            >
              Descargar PDF
            </a>
          )}
          <button type="button" className="facturas-btn-new" onClick={handleNewInvoice}>
            Nueva Factura
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="facturas">
      <div className="facturas-header">
        <h2>Facturación Electrónica</h2>
        <p>Cree y envíe comprobantes fiscales electrónicos.</p>
        {isReadOnly && (
          <span className="facturas-readonly-badge" role="status">
            Modo solo lectura
          </span>
        )}
      </div>

      <form className="facturas-form" onSubmit={handleSubmit} noValidate>
        {generalError && (
          <div className="facturas-form-error" role="alert">
            {generalError}
          </div>
        )}

        {/* Tipo de Comprobante */}
        <div className="facturas-row">
          <div className="facturas-field">
            <label htmlFor="tipo_comprobante">Tipo de Comprobante</label>
            <select
              id="tipo_comprobante"
              value={tipoComprobante}
              onChange={(e) => setTipoComprobante(e.target.value)}
              disabled={isReadOnly}
            >
              <option value="E31">Factura de Crédito Fiscal</option>
              <option value="E32">Factura de Consumo</option>
              <option value="E33">Nota de Débito</option>
              <option value="E34">Nota de Crédito</option>
              <option value="E41">E41 - Compras</option>
              <option value="E43">E43 - Gastos Menores</option>
              <option value="E44">E44 - Regímenes Especiales</option>
              <option value="E45">E45 - Gubernamental</option>
              <option value="E46">E46 - Exportaciones</option>
            </select>
          </div>
          <div className="facturas-field">
            <label htmlFor="fecha_vencimiento">Fecha Vencimiento (opcional)</label>
            <input
              id="fecha_vencimiento"
              type="date"
              value={fechaVencimiento}
              onChange={(e) => setFechaVencimiento(e.target.value)}
              disabled={isReadOnly}
            />
          </div>
        </div>

        {/* Información de Referencia (solo para Notas Débito/Crédito) */}
        {(tipoComprobante === 'E33' || tipoComprobante === 'E34') && (
          <div className="facturas-row" style={{ backgroundColor: '#f8f9fa', padding: '1rem', borderRadius: '8px', marginBottom: '1rem' }}>
            <div className="facturas-field">
              <label htmlFor="ncf_modificado">Comprobante a modificar</label>
              <input
                id="ncf_modificado"
                type="text"
                value={ncfModificado}
                onChange={(e) => setNcfModificado(e.target.value)}
                disabled={isReadOnly}
                placeholder="E310000000001"
              />
            </div>
            <div className="facturas-field">
              <label htmlFor="fecha_ncf_modificado">Fecha del comprobante original</label>
              <input
                id="fecha_ncf_modificado"
                type="date"
                value={fechaNcfModificado}
                onChange={(e) => setFechaNcfModificado(e.target.value)}
                disabled={isReadOnly}
              />
            </div>
            <div className="facturas-field">
              <label htmlFor="codigo_modificacion">Código Modificación</label>
              <select
                id="codigo_modificacion"
                value={codigoModificacion}
                onChange={(e) => setCodigoModificacion(Number(e.target.value))}
                disabled={isReadOnly}
              >
                <option value={1}>1 - Disminución de precio</option>
                <option value={2}>2 - Corrección</option>
                <option value={3}>3 - Devolución</option>
                <option value={4}>4 - Bonificación</option>
                <option value={5}>5 - Descuento</option>
              </select>
            </div>
          </div>
        )}

        {/* Receptor info */}
        <div className="facturas-row">
          <div className="facturas-field">
            <label htmlFor="rnc_receptor">RNC Receptor</label>
            <input
              id="rnc_receptor"
              type="text"
              maxLength={11}
              value={rncReceptor}
              onChange={(e) => {
                const val = e.target.value;
                setRncReceptor(val);
                setErrors((prev) => ({ ...prev, rnc_receptor: undefined }));
                // Auto-lookup cuando tiene 9 u 11 dígitos
                if (/^\d{9}$|^\d{11}$/.test(val)) {
                  lookupRnc(val);
                } else {
                  setNombreReceptor('');
                }
              }}
              disabled={isReadOnly}
              aria-invalid={!!errors.rnc_receptor}
              aria-describedby={errors.rnc_receptor ? 'err-rnc-receptor' : undefined}
              placeholder="9 u 11 dígitos"
            />
            <span id="err-rnc-receptor" className="facturas-field-error" role="alert">
              {errors.rnc_receptor || ''}
            </span>
          </div>

          <div className="facturas-field">
            <label htmlFor="nombre_receptor">Nombre Receptor</label>
            <input
              id="nombre_receptor"
              type="text"
              value={rncLookupLoading ? 'Buscando...' : nombreReceptor}
              onChange={(e) => {
                setNombreReceptor(e.target.value);
                setErrors((prev) => ({ ...prev, nombre_receptor: undefined }));
              }}
              disabled={isReadOnly || rncLookupLoading}
              aria-invalid={!!errors.nombre_receptor}
              aria-describedby={errors.nombre_receptor ? 'err-nombre-receptor' : undefined}
              placeholder="Se completa automáticamente al ingresar RNC"
            />
            <span id="err-nombre-receptor" className="facturas-field-error" role="alert">
              {errors.nombre_receptor || ''}
            </span>
          </div>
        </div>

        {/* Line items */}
        <div className="facturas-lines-section">
          <h3 className="facturas-lines-title">Ítems de la factura</h3>

          {lines.map((line, index) => (
            <LineItemRow
              key={index}
              index={index}
              line={line}
              disabled={isReadOnly}
              canRemove={lines.length > 1}
              onChange={handleLineChange}
              onRemove={handleRemoveLine}
              onSelectCatalog={handleSelectCatalogItem}
            />
          ))}

          {errors.items && (
            <div className="facturas-lines-error" role="alert">
              {errors.items}
            </div>
          )}

          <button
            type="button"
            className="facturas-btn-add"
            onClick={handleAddLine}
            disabled={isReadOnly}
            aria-label="Agregar línea de ítem"
          >
            + Agregar ítem
          </button>
        </div>

        {/* Descuentos */}
        <div className="facturas-row" style={{ marginTop: '1rem' }}>
          <div className="facturas-field">
            <label htmlFor="descuento_global">Descuento global (%)</label>
            <input
              id="descuento_global"
              type="number"
              min={0}
              max={100}
              step={0.01}
              value={descuentoGlobal}
              onChange={(e) => setDescuentoGlobal(Math.min(100, Math.max(0, parseFloat(e.target.value) || 0)))}
              disabled={isReadOnly}
              placeholder="0"
            />
          </div>
        </div>

        {/* Totals */}
        <div className="facturas-totals" aria-label="Resumen de totales">
          <div className="facturas-totals-row">
            <span>Subtotal:</span>
            <span>RD$ {formatCurrency(totalSubtotal)}</span>
          </div>
          {descuentoGlobal > 0 && (
            <div className="facturas-totals-row" style={{ color: '#d93025' }}>
              <span>Descuento ({descuentoGlobal}%):</span>
              <span>- RD$ {formatCurrency(descuentoMonto)}</span>
            </div>
          )}
          <div className="facturas-totals-row">
            <span>ITBIS:</span>
            <span>RD$ {formatCurrency(totalItbis)}</span>
          </div>
          <div className="facturas-totals-row facturas-totals-grand">
            <span>Total:</span>
            <span>RD$ {formatCurrency(grandTotal)}</span>
          </div>
        </div>

        {/* Submit */}
        <div className="facturas-submit">
          <button
            type="submit"
            className="facturas-btn-primary"
            disabled={submitting || isReadOnly}
          >
            {submitting ? 'Enviando factura...' : 'Enviar Factura'}
          </button>
        </div>
      </form>
    </div>
  );
}

/* ---------- Line Item Row ---------- */

function LineItemRow({
  index,
  line,
  disabled,
  canRemove,
  onChange,
  onRemove,
  onSelectCatalog,
}: {
  index: number;
  line: LineItem;
  disabled: boolean;
  canRemove: boolean;
  onChange: (index: number, field: keyof LineItem, value: string | number) => void;
  onRemove: (index: number) => void;
  onSelectCatalog: (index: number, item: CatalogItem) => void;
}) {
  const subtotal = calcSubtotal(line);
  const itbis = calcItbis(line);

  return (
    <div className="facturas-line" role="group" aria-label={`Ítem ${index + 1}`}>
      <div className="facturas-line-field">
        <label htmlFor={`line-desc-${index}`}>Descripción</label>
        <CatalogSearchInput
          index={index}
          value={line.descripcion}
          disabled={disabled}
          onSelect={onSelectCatalog}
          onChange={(val) => onChange(index, 'descripcion', val)}
        />
      </div>

      <div className="facturas-line-field">
        <label htmlFor={`line-qty-${index}`}>Cantidad</label>
        <input
          id={`line-qty-${index}`}
          type="number"
          min={1}
          step={1}
          value={line.cantidad}
          onChange={(e) => onChange(index, 'cantidad', Math.max(1, parseInt(e.target.value) || 1))}
          disabled={disabled}
        />
      </div>

      <div className="facturas-line-field">
        <label>Subtotal</label>
        <div className="facturas-line-calculated">
          RD$ {formatCurrency(subtotal)}
        </div>
      </div>

      <div className="facturas-line-field">
        <label>ITBIS ({line.tasa_itbis}%)</label>
        <div className="facturas-line-calculated">
          RD$ {formatCurrency(itbis)}
        </div>
      </div>

      <button
        type="button"
        className="facturas-line-remove"
        onClick={() => onRemove(index)}
        disabled={disabled || !canRemove}
        aria-label={`Eliminar ítem ${index + 1}`}
      >
        ✕
      </button>
    </div>
  );
}

/* ---------- Catalog Search Input ---------- */

function CatalogSearchInput({
  index,
  value,
  disabled,
  onSelect,
  onChange,
}: {
  index: number;
  value: string;
  disabled: boolean;
  onSelect: (index: number, item: CatalogItem) => void;
  onChange: (value: string) => void;
}) {
  const [query, setQuery] = useState(value);
  const [results, setResults] = useState<CatalogItem[]>([]);
  const [showResults, setShowResults] = useState(false);
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Sync external value changes
  useEffect(() => {
    setQuery(value);
  }, [value]);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowResults(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const searchCatalog = useCallback(async (searchQuery: string) => {
    if (searchQuery.length < 2) {
      setResults([]);
      setShowResults(false);
      return;
    }

    setLoading(true);
    try {
      const token = getAccessToken();
      const res = await fetch(`/api/v1/catalogo?search=${encodeURIComponent(searchQuery)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setResults(Array.isArray(data) ? data : []);
        setShowResults(true);
      } else {
        setResults([]);
      }
    } catch {
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setQuery(val);
    onChange(val);

    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }
    debounceRef.current = setTimeout(() => {
      searchCatalog(val);
    }, 300);
  };

  const handleSelect = (item: CatalogItem) => {
    setQuery(item.descripcion);
    setShowResults(false);
    onSelect(index, item);
  };

  return (
    <div className="facturas-catalog-search" ref={containerRef}>
      <input
        id={`line-desc-${index}`}
        type="text"
        value={query}
        onChange={handleInputChange}
        onFocus={() => {
          if (results.length > 0) setShowResults(true);
        }}
        disabled={disabled}
        placeholder="Buscar en catálogo..."
        autoComplete="off"
        role="combobox"
        aria-expanded={showResults}
        aria-controls={`catalog-results-${index}`}
        aria-autocomplete="list"
      />
      {showResults && (
        <div
          id={`catalog-results-${index}`}
          className="facturas-catalog-results"
          role="listbox"
          aria-label="Resultados del catálogo"
        >
          {loading && (
            <div className="facturas-catalog-empty">Buscando...</div>
          )}
          {!loading && results.length === 0 && (
            <div className="facturas-catalog-empty">No se encontraron resultados</div>
          )}
          {!loading &&
            results.map((item) => (
              <div
                key={item.id}
                className="facturas-catalog-item"
                role="option"
                aria-selected={false}
                onClick={() => handleSelect(item)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') handleSelect(item);
                }}
                tabIndex={0}
              >
                <span className="facturas-catalog-item-name">
                  {item.codigo} — {item.descripcion}
                </span>
                <span className="facturas-catalog-item-price">
                  RD$ {formatCurrency(item.precio_unitario)} (ITBIS {item.tasa_itbis}%)
                </span>
              </div>
            ))}
        </div>
      )}
    </div>
  );
}

export default Facturas;
