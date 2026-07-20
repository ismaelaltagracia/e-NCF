import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import './Configuracion.css';

interface PasswordErrors {
  current_password?: string;
  new_password?: string;
  confirm_password?: string;
}

interface CertErrors {
  file?: string;
  password?: string;
  general?: string;
}

function Configuracion() {
  return (
    <div className="configuracion-page">
      <div className="configuracion-header">
        <h2>Configuración de Empresa</h2>
        <p>Administre el certificado digital y la contraseña de su cuenta.</p>
      </div>

      <div className="configuracion-sections">
        <AmbienteDgii />
        <CambiarCertificado />
        <CambiarPassword />
      </div>
    </div>
  );
}

/* ---------- Ambiente DGII ---------- */

function AmbienteDgii() {
  const { accessToken } = useAuth();
  const [ambiente, setAmbiente] = useState<string>('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchAmbiente() {
      try {
        const res = await fetch('/api/v1/empresas/me/ambiente-dgii', {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        if (res.ok) {
          const data = await res.json();
          setAmbiente(data.ambiente || 'desconocido');
        }
      } catch {
        // ignore
      } finally {
        setLoading(false);
      }
    }
    fetchAmbiente();
  }, [accessToken]);

  return (
    <section className="config-section">
      <h3>Ambiente DGII</h3>
      <p className="config-description">
        Indica si el sistema está conectado al ambiente de certificación o producción de la DGII.
      </p>
      <div style={{ padding: '1rem', backgroundColor: ambiente === 'produccion' ? '#e8f5e9' : '#fff3e0', borderRadius: '8px', display: 'inline-block' }}>
        {loading ? (
          <span>Cargando...</span>
        ) : (
          <span style={{ fontWeight: 600, fontSize: '1rem' }}>
            {ambiente === 'produccion' ? '🟢 Producción' : '🟡 Certificación'}
          </span>
        )}
      </div>
    </section>
  );
}

/* ---------- Cambiar Certificado ---------- */

function CambiarCertificado() {
  const { accessToken } = useAuth();
  const [file, setFile] = useState<File | null>(null);
  const [certPassword, setCertPassword] = useState('');
  const [errors, setErrors] = useState<CertErrors>({});
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState('');

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0] || null;
    setErrors({});
    setSuccess('');

    if (selected) {
      const ext = selected.name.toLowerCase();
      if (!ext.endsWith('.p12') && !ext.endsWith('.pfx')) {
        setErrors({ file: 'Solo se aceptan archivos .p12 o .pfx' });
        setFile(null);
        return;
      }
      if (selected.size > 10 * 1024 * 1024) {
        setErrors({ file: 'El archivo no puede exceder 10MB' });
        setFile(null);
        return;
      }
      setFile(selected);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const newErrors: CertErrors = {};
    if (!file) {
      newErrors.file = 'Debe seleccionar un archivo de certificado';
    }
    if (!certPassword.trim()) {
      newErrors.password = 'Contraseña del certificado requerida';
    }
    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    setSubmitting(true);
    setErrors({});
    setSuccess('');

    try {
      const formData = new FormData();
      formData.append('certificado', file!);
      formData.append('password', certPassword);

      const res = await fetch('/api/v1/empresas/me/certificado', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
        body: formData,
      });

      if (!res.ok) {
        const body = await res.json();
        const message: string = body.message || 'Error al actualizar el certificado';
        setErrors({ general: message });
        setFile(null);
        return;
      }

      setSuccess('Certificado actualizado exitosamente.');
      setFile(null);
      setCertPassword('');
    } catch {
      setErrors({ general: 'Error de conexión. Verifique su red e intente nuevamente.' });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="config-section">
      <h3>Actualizar Certificado Digital</h3>
      <p className="config-description">
        Cargue un nuevo certificado digital (.p12 o .pfx) para reemplazar el actual.
      </p>

      <form className="config-form" onSubmit={handleSubmit} noValidate>
        {errors.general && (
          <div className="form-error" role="alert">{errors.general}</div>
        )}
        {success && (
          <div className="form-success" role="status">{success}</div>
        )}

        <div className="form-field">
          <label htmlFor="cert_file">Archivo de Certificado</label>
          <div className="cert-upload-area">
            <label htmlFor="cert_file" className="cert-upload-label">
              Seleccionar archivo
            </label>
            <input
              id="cert_file"
              type="file"
              accept=".p12,.pfx"
              onChange={handleFileChange}
              aria-invalid={!!errors.file}
              aria-describedby={errors.file ? 'err-cfg-cert-file' : undefined}
            />
            <p className="cert-upload-hint">Formatos aceptados: .p12, .pfx — Máximo 10MB</p>
            {file && <p className="cert-file-selected">{file.name}</p>}
          </div>
          <span id="err-cfg-cert-file" className="field-error" role="alert">
            {errors.file || ''}
          </span>
        </div>

        <div className="form-field">
          <label htmlFor="cfg_cert_password">Contraseña del Certificado</label>
          <input
            id="cfg_cert_password"
            type="password"
            value={certPassword}
            onChange={(e) => {
              setCertPassword(e.target.value);
              setErrors((prev) => ({ ...prev, password: undefined }));
            }}
            aria-invalid={!!errors.password}
            aria-describedby={errors.password ? 'err-cfg-cert-pass' : undefined}
          />
          <span id="err-cfg-cert-pass" className="field-error" role="alert">
            {errors.password || ''}
          </span>
        </div>

        <div className="form-submit">
          <button type="submit" className="btn-primary" disabled={submitting}>
            {submitting ? 'Actualizando...' : 'Actualizar Certificado'}
          </button>
        </div>
      </form>
    </section>
  );
}

/* ---------- Cambiar Contraseña ---------- */

function CambiarPassword() {
  const { accessToken } = useAuth();
  const [values, setValues] = useState({
    current_password: '',
    new_password: '',
    confirm_password: '',
  });
  const [errors, setErrors] = useState<PasswordErrors>({});
  const [generalError, setGeneralError] = useState('');
  const [success, setSuccess] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleChange = (field: keyof typeof values) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setValues((prev) => ({ ...prev, [field]: e.target.value }));
    setErrors((prev) => ({ ...prev, [field]: undefined }));
    setGeneralError('');
    setSuccess('');
  };

  const validate = (): PasswordErrors => {
    const errs: PasswordErrors = {};

    if (!values.current_password) {
      errs.current_password = 'Contraseña actual requerida';
    }

    if (!values.new_password) {
      errs.new_password = 'Nueva contraseña requerida';
    } else if (values.new_password.length < 8) {
      errs.new_password = 'Debe tener al menos 8 caracteres';
    } else if (!/[A-Z]/.test(values.new_password)) {
      errs.new_password = 'Debe contener al menos una letra mayúscula';
    } else if (!/[a-z]/.test(values.new_password)) {
      errs.new_password = 'Debe contener al menos una letra minúscula';
    } else if (!/[0-9]/.test(values.new_password)) {
      errs.new_password = 'Debe contener al menos un dígito';
    }

    if (!values.confirm_password) {
      errs.confirm_password = 'Debe confirmar la nueva contraseña';
    } else if (values.new_password !== values.confirm_password) {
      errs.confirm_password = 'Las contraseñas no coinciden';
    }

    return errs;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const validationErrors = validate();
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      return;
    }

    setSubmitting(true);
    setGeneralError('');
    setSuccess('');

    try {
      const res = await fetch('/api/v1/users/me/password', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          current_password: values.current_password,
          new_password: values.new_password,
        }),
      });

      if (!res.ok) {
        const body = await res.json();
        if (res.status === 401 || /actual|current|incorrecta/i.test(body.message || '')) {
          setErrors({ current_password: 'Contraseña actual incorrecta' });
        } else {
          setGeneralError(body.message || 'Error al cambiar la contraseña');
        }
        return;
      }

      setSuccess('Contraseña actualizada exitosamente.');
      setValues({ current_password: '', new_password: '', confirm_password: '' });
    } catch {
      setGeneralError('Error de conexión. Verifique su red e intente nuevamente.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="config-section">
      <h3>Cambiar Contraseña</h3>
      <p className="config-description">
        Actualice la contraseña de su cuenta de usuario.
      </p>

      <form className="config-form" onSubmit={handleSubmit} noValidate>
        {generalError && (
          <div className="form-error" role="alert">{generalError}</div>
        )}
        {success && (
          <div className="form-success" role="status">{success}</div>
        )}

        <div className="form-field">
          <label htmlFor="current_password">Contraseña Actual</label>
          <input
            id="current_password"
            type="password"
            value={values.current_password}
            onChange={handleChange('current_password')}
            aria-invalid={!!errors.current_password}
            aria-describedby={errors.current_password ? 'err-cur-pass' : undefined}
            autoComplete="current-password"
          />
          <span id="err-cur-pass" className="field-error" role="alert">
            {errors.current_password || ''}
          </span>
        </div>

        <div className="form-field">
          <label htmlFor="new_password">Nueva Contraseña</label>
          <input
            id="new_password"
            type="password"
            value={values.new_password}
            onChange={handleChange('new_password')}
            aria-invalid={!!errors.new_password}
            aria-describedby={errors.new_password ? 'err-new-pass' : undefined}
            autoComplete="new-password"
          />
          <span id="err-new-pass" className="field-error" role="alert">
            {errors.new_password || ''}
          </span>
        </div>

        <div className="form-field">
          <label htmlFor="cfg_confirm_password">Confirmar Nueva Contraseña</label>
          <input
            id="cfg_confirm_password"
            type="password"
            value={values.confirm_password}
            onChange={handleChange('confirm_password')}
            aria-invalid={!!errors.confirm_password}
            aria-describedby={errors.confirm_password ? 'err-cfg-confirm-pass' : undefined}
            autoComplete="new-password"
          />
          <span id="err-cfg-confirm-pass" className="field-error" role="alert">
            {errors.confirm_password || ''}
          </span>
        </div>

        <div className="form-submit">
          <button type="submit" className="btn-primary" disabled={submitting}>
            {submitting ? 'Actualizando...' : 'Cambiar Contraseña'}
          </button>
        </div>
      </form>
    </section>
  );
}

export default Configuracion;
