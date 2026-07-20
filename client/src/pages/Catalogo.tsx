import { useState, useCallback, useEffect, useRef } from 'react';
import Swal from 'sweetalert2';
import './Catalogo.css';

/* ---------- Types ---------- */

interface CatalogItem {
  id: string;
  tipo: 'producto' | 'servicio';
  codigo: string;
  descripcion: string;
  precio_unitario: number;
  tasa_itbis: number;
  activo: boolean;
  created_at: string;
  updated_at: string;
}

interface FormData {
  tipo: 'producto' | 'servicio';
  codigo: string;
  descripcion: string;
  precio_unitario: string;
  tasa_itbis: number;
}

interface FormErrors {
  tipo?: string;
  codigo?: string;
  descripcion?: string;
  precio_unitario?: string;
  tasa_itbis?: string;
}

/* ---------- Helpers ---------- */

function getAccessToken(): string {
  return localStorage.getItem('access_token') || '';
}

function formatCurrency(value: number): string {
  return value.toLocaleString('es-DO', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

const EMPTY_FORM: FormData = {
  tipo: 'producto',
  codigo: '',
  descripcion: '',
  precio_unitario: '',
  tasa_itbis: 18,
};

/* ---------- Main Component ---------- */

function Catalogo() {
  const [items, setItems] = useState<CatalogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [filterTipo, setFilterTipo] = useState<'' | 'producto' | 'servicio'>('');
  const [filterActivo, setFilterActivo] = useState<'' | 'true' | 'false'>('');
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Form state
  const [showForm, setShowForm] = useState(false);
  const [editingItem, setEditingItem] = useState<CatalogItem | null>(null);
  const [formData, setFormData] = useState<FormData>(EMPTY_FORM);
  const [formErrors, setFormErrors] = useState<FormErrors>({});
  const [formGeneralError, setFormGeneralError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  /* ---------- Fetch Items ---------- */

  const fetchItems = useCallback(async (search?: string, tipo?: string, activo?: string) => {
    setLoading(true);
    setError('');
    try {
      const token = getAccessToken();
      const params = new URLSearchParams();
      if (search) params.set('search', search);
      if (tipo) params.set('tipo', tipo);
      if (activo) params.set('activo', activo);

      const queryStr = params.toString();
      const url = `/api/v1/catalogo${queryStr ? `?${queryStr}` : ''}`;

      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) {
        const errBody = await res.json().catch(() => null);
        throw new Error(errBody?.message || `Error ${res.status}`);
      }

      const data = await res.json();
      setItems(Array.isArray(data) ? data : []);
    } catch (err) {
      Swal.fire('Error', err instanceof Error ? err.message : 'Error al cargar el catálogo', 'error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchItems(searchTerm, filterTipo, filterActivo);
  }, [fetchItems, filterTipo, filterActivo]);

  /* ---------- Debounced Search ---------- */

  const handleSearchChange = (value: string) => {
    setSearchTerm(value);
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }
    debounceRef.current = setTimeout(() => {
      fetchItems(value, filterTipo, filterActivo);
    }, 300);
  };

  /* ---------- Form Validation ---------- */

  const validateForm = (): boolean => {
    const errors: FormErrors = {};

    if (!formData.tipo) {
      errors.tipo = 'Tipo es requerido';
    }

    if (!formData.codigo.trim()) {
      errors.codigo = 'Código es requerido';
    }

    if (!formData.descripcion.trim()) {
      errors.descripcion = 'Descripción es requerida';
    }

    const precio = parseFloat(formData.precio_unitario);
    if (!formData.precio_unitario.trim()) {
      errors.precio_unitario = 'Precio es requerido';
    } else if (isNaN(precio) || precio <= 0) {
      errors.precio_unitario = 'Precio debe ser mayor a 0';
    } else if (!/^\d+(\.\d{1,2})?$/.test(formData.precio_unitario.trim())) {
      errors.precio_unitario = 'Máximo 2 decimales permitidos';
    }

    if (![0, 16, 18].includes(formData.tasa_itbis)) {
      errors.tasa_itbis = 'Tasa ITBIS debe ser 0%, 16% o 18%';
    }

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  /* ---------- Form Handlers ---------- */

  const openCreateForm = () => {
    setEditingItem(null);
    setFormData(EMPTY_FORM);
    setFormErrors({});
    setFormGeneralError('');
    setShowForm(true);
  };

  const openEditForm = (item: CatalogItem) => {
    setEditingItem(item);
    setFormData({
      tipo: item.tipo,
      codigo: item.codigo,
      descripcion: item.descripcion,
      precio_unitario: item.precio_unitario.toString(),
      tasa_itbis: item.tasa_itbis,
    });
    setFormErrors({});
    setFormGeneralError('');
    setShowForm(true);
  };

  const closeForm = () => {
    setShowForm(false);
    setEditingItem(null);
    setFormData(EMPTY_FORM);
    setFormErrors({});
    setFormGeneralError('');
  };

  const handleFormChange = (field: keyof FormData, value: string | number) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    setFormErrors((prev) => ({ ...prev, [field]: undefined }));
  };

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm()) return;

    setSubmitting(true);
    setFormGeneralError('');

    try {
      const token = getAccessToken();
      const body = {
        tipo: formData.tipo,
        codigo: formData.codigo.trim(),
        descripcion: formData.descripcion.trim(),
        precio_unitario: parseFloat(formData.precio_unitario),
        tasa_itbis: formData.tasa_itbis,
      };

      const isEditing = !!editingItem;
      const url = isEditing
        ? `/api/v1/catalogo/${editingItem.id}`
        : '/api/v1/catalogo';
      const method = isEditing ? 'PATCH' : 'POST';

      const res = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const errBody = await res.json().catch(() => null);
        if (errBody?.errors && Array.isArray(errBody.errors)) {
          const fieldErrors: FormErrors = {};
          for (const err of errBody.errors) {
            if (err.path && !fieldErrors[err.path as keyof FormErrors]) {
              (fieldErrors as Record<string, string>)[err.path] = err.message;
            }
          }
          if (Object.keys(fieldErrors).length > 0) {
            setFormErrors(fieldErrors);
          } else {
            Swal.fire('Error', errBody.message || 'Error al guardar', 'error');
          }
        } else {
          Swal.fire('Error', errBody?.message || 'Error al guardar', 'error');
        }
        return;
      }

      closeForm();
      Swal.fire({ title: editingItem ? 'Actualizado' : 'Creado', text: editingItem ? 'Ítem actualizado exitosamente' : 'Ítem creado exitosamente', icon: 'success', timer: 2000, showConfirmButton: false });
      fetchItems(searchTerm, filterTipo, filterActivo);
    } catch {
      Swal.fire('Error', 'Error de conexión. Verifique su red e intente nuevamente.', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  /* ---------- Delete (Soft Delete) ---------- */

  const handleDelete = async (item: CatalogItem) => {
    const result = await Swal.fire({
      title: '¿Desactivar ítem?',
      html: `Se desactivará <strong>"${item.descripcion}"</strong> del catálogo.<br>Podrá reactivarlo más adelante.`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#d93025',
      cancelButtonColor: '#5f6368',
      confirmButtonText: 'Desactivar',
      cancelButtonText: 'Cancelar',
    });

    if (!result.isConfirmed) return;

    try {
      const token = getAccessToken();
      const res = await fetch(`/api/v1/catalogo/${item.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) {
        const errBody = await res.json().catch(() => null);
        Swal.fire('Error', errBody?.message || 'Error al eliminar el ítem', 'error');
        return;
      }

      Swal.fire({ title: 'Eliminado', text: 'Ítem desactivado exitosamente', icon: 'success', timer: 2000, showConfirmButton: false });
      fetchItems(searchTerm, filterTipo, filterActivo);
    } catch {
      Swal.fire('Error', 'Error de conexión al eliminar', 'error');
    }
  };

  /* ---------- Render ---------- */

  return (
    <div className="catalogo">
      <div className="catalogo-header">
        <div className="catalogo-header-top">
          <div>
            <h2>Catálogo de Productos y Servicios</h2>
            <p>Gestione los productos y servicios disponibles para facturación.</p>
          </div>
          <button
            type="button"
            className="catalogo-btn-primary"
            onClick={openCreateForm}
            aria-label="Agregar nuevo ítem al catálogo"
          >
            + Nuevo Ítem
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="catalogo-filters" role="search" aria-label="Filtros del catálogo">
        <div className="catalogo-filter-field catalogo-filter-search">
          <label htmlFor="catalogo-search">Buscar</label>
          <input
            id="catalogo-search"
            type="text"
            placeholder="Buscar por código o descripción..."
            value={searchTerm}
            onChange={(e) => handleSearchChange(e.target.value)}
            aria-label="Buscar en catálogo"
          />
        </div>

        <div className="catalogo-filter-field">
          <label htmlFor="catalogo-filter-tipo">Tipo</label>
          <select
            id="catalogo-filter-tipo"
            value={filterTipo}
            onChange={(e) => setFilterTipo(e.target.value as '' | 'producto' | 'servicio')}
            aria-label="Filtrar por tipo"
          >
            <option value="">Todos</option>
            <option value="producto">Producto</option>
            <option value="servicio">Servicio</option>
          </select>
        </div>

        <div className="catalogo-filter-field">
          <label htmlFor="catalogo-filter-activo">Estado</label>
          <select
            id="catalogo-filter-activo"
            value={filterActivo}
            onChange={(e) => setFilterActivo(e.target.value as '' | 'true' | 'false')}
            aria-label="Filtrar por estado"
          >
            <option value="">Todos</option>
            <option value="true">Activo</option>
            <option value="false">Inactivo</option>
          </select>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="catalogo-error" role="alert">
          {error}
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="catalogo-loading" role="status" aria-live="polite">
          <span className="catalogo-spinner" aria-hidden="true" />
          Cargando catálogo...
        </div>
      )}

      {/* Empty state */}
      {!loading && !error && items.length === 0 && (
        <div className="catalogo-empty" role="status">
          <p>No se encontraron ítems en el catálogo.</p>
          {(searchTerm || filterTipo || filterActivo) && (
            <p className="catalogo-empty-hint">
              Intente ajustar los filtros o el término de búsqueda.
            </p>
          )}
        </div>
      )}

      {/* Items Table */}
      {!loading && items.length > 0 && (
        <div className="catalogo-table-wrapper">
          <table className="catalogo-table" aria-label="Lista de ítems del catálogo">
            <thead>
              <tr>
                <th scope="col">Código</th>
                <th scope="col">Descripción</th>
                <th scope="col">Tipo</th>
                <th scope="col">Precio</th>
                <th scope="col">ITBIS</th>
                <th scope="col">Estado</th>
                <th scope="col">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id} className={!item.activo ? 'catalogo-row-inactive' : ''}>
                  <td className="catalogo-cell-code">{item.codigo}</td>
                  <td>{item.descripcion}</td>
                  <td>
                    <span className={`catalogo-badge catalogo-badge-${item.tipo}`}>
                      {item.tipo === 'producto' ? 'Producto' : 'Servicio'}
                    </span>
                  </td>
                  <td className="catalogo-cell-price">RD$ {formatCurrency(item.precio_unitario)}</td>
                  <td className="catalogo-cell-itbis">{item.tasa_itbis}%</td>
                  <td>
                    <span
                      className={`catalogo-badge ${item.activo ? 'catalogo-badge-activo' : 'catalogo-badge-inactivo'}`}
                    >
                      {item.activo ? 'Activo' : 'Inactivo'}
                    </span>
                  </td>
                  <td className="catalogo-cell-actions">
                    <button
                      type="button"
                      className="catalogo-btn-edit"
                      onClick={() => openEditForm(item)}
                      aria-label={`Editar ${item.descripcion}`}
                    >
                      Editar
                    </button>
                    {item.activo && (
                      <button
                        type="button"
                        className="catalogo-btn-delete"
                        onClick={() => handleDelete(item)}
                        aria-label={`Desactivar ${item.descripcion}`}
                      >
                        Eliminar
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal Form */}
      {showForm && (
        <div
          className="catalogo-modal-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="catalogo-form-title"
        >
          <div className="catalogo-modal">
            <div className="catalogo-modal-header">
              <h3 id="catalogo-form-title">
                {editingItem ? 'Editar Ítem' : 'Nuevo Ítem'}
              </h3>
              <button
                type="button"
                className="catalogo-modal-close"
                onClick={closeForm}
                aria-label="Cerrar formulario"
              >
                ✕
              </button>
            </div>

            <form className="catalogo-form" onSubmit={handleFormSubmit} noValidate>
              {formGeneralError && (
                <div className="catalogo-form-error" role="alert">
                  {formGeneralError}
                </div>
              )}

              <div className="catalogo-form-row">
                <div className="catalogo-form-field">
                  <label htmlFor="catalogo-tipo">Tipo *</label>
                  <select
                    id="catalogo-tipo"
                    value={formData.tipo}
                    onChange={(e) => handleFormChange('tipo', e.target.value)}
                    aria-invalid={!!formErrors.tipo}
                    aria-describedby={formErrors.tipo ? 'err-tipo' : undefined}
                  >
                    <option value="producto">Producto</option>
                    <option value="servicio">Servicio</option>
                  </select>
                  <span id="err-tipo" className="catalogo-field-error" role="alert">
                    {formErrors.tipo || ''}
                  </span>
                </div>

                <div className="catalogo-form-field">
                  <label htmlFor="catalogo-codigo">Código *</label>
                  <input
                    id="catalogo-codigo"
                    type="text"
                    value={formData.codigo}
                    onChange={(e) => handleFormChange('codigo', e.target.value)}
                    aria-invalid={!!formErrors.codigo}
                    aria-describedby={formErrors.codigo ? 'err-codigo' : undefined}
                    placeholder="Ej: PROD-001"
                  />
                  <span id="err-codigo" className="catalogo-field-error" role="alert">
                    {formErrors.codigo || ''}
                  </span>
                </div>
              </div>

              <div className="catalogo-form-field">
                <label htmlFor="catalogo-descripcion">Descripción *</label>
                <input
                  id="catalogo-descripcion"
                  type="text"
                  value={formData.descripcion}
                  onChange={(e) => handleFormChange('descripcion', e.target.value)}
                  aria-invalid={!!formErrors.descripcion}
                  aria-describedby={formErrors.descripcion ? 'err-descripcion' : undefined}
                  placeholder="Descripción del producto o servicio"
                />
                <span id="err-descripcion" className="catalogo-field-error" role="alert">
                  {formErrors.descripcion || ''}
                </span>
              </div>

              <div className="catalogo-form-row">
                <div className="catalogo-form-field">
                  <label htmlFor="catalogo-precio">Precio Unitario (RD$) *</label>
                  <input
                    id="catalogo-precio"
                    type="text"
                    inputMode="decimal"
                    value={formData.precio_unitario}
                    onChange={(e) => handleFormChange('precio_unitario', e.target.value)}
                    aria-invalid={!!formErrors.precio_unitario}
                    aria-describedby={formErrors.precio_unitario ? 'err-precio' : undefined}
                    placeholder="0.00"
                  />
                  <span id="err-precio" className="catalogo-field-error" role="alert">
                    {formErrors.precio_unitario || ''}
                  </span>
                </div>

                <div className="catalogo-form-field">
                  <label htmlFor="catalogo-itbis">Tasa ITBIS *</label>
                  <select
                    id="catalogo-itbis"
                    value={formData.tasa_itbis}
                    onChange={(e) => handleFormChange('tasa_itbis', parseInt(e.target.value))}
                    aria-invalid={!!formErrors.tasa_itbis}
                    aria-describedby={formErrors.tasa_itbis ? 'err-itbis' : undefined}
                  >
                    <option value={18}>18%</option>
                    <option value={16}>16%</option>
                    <option value={0}>0% (Exento)</option>
                  </select>
                  <span id="err-itbis" className="catalogo-field-error" role="alert">
                    {formErrors.tasa_itbis || ''}
                  </span>
                </div>
              </div>

              <div className="catalogo-form-actions">
                <button
                  type="button"
                  className="catalogo-btn-cancel"
                  onClick={closeForm}
                  disabled={submitting}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="catalogo-btn-primary"
                  disabled={submitting}
                >
                  {submitting
                    ? 'Guardando...'
                    : editingItem
                      ? 'Guardar Cambios'
                      : 'Crear Ítem'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default Catalogo;
