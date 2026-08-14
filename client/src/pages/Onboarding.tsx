import { useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import './Onboarding.css';

type Step = 'registro' | 'certificado' | 'confirmacion';

interface FieldErrors {
  empresa_nombre?: string;
  rnc?: string;
  admin_nombre?: string;
  email?: string;
  password?: string;
  confirm_password?: string;
}

interface CertErrors {
  file?: string;
  password?: string;
  general?: string;
}

/* ---------- Validation helpers ---------- */

function validateRegistroForm(values: {
  empresa_nombre: string;
  rnc: string;
  admin_nombre: string;
  email: string;
  password: string;
  confirm_password: string;
}): FieldErrors {
  const errors: FieldErrors = {};

  if (!values.empresa_nombre.trim()) {
    errors.empresa_nombre = 'Nombre de empresa requerido';
  } else if (values.empresa_nombre.length > 150) {
    errors.empresa_nombre = 'Nombre de empresa no puede exceder 150 caracteres';
  }

  if (!values.rnc.trim()) {
    errors.rnc = 'RNC requerido';
  } else if (!/^[A-Za-z0-9]{9}$|^[A-Za-z0-9]{11}$/.test(values.rnc)) {
    errors.rnc = 'RNC debe tener 9 u 11 caracteres alfanuméricos';
  }

  if (!values.admin_nombre.trim()) {
    errors.admin_nombre = 'Nombre de administrador requerido';
  } else if (values.admin_nombre.length > 100) {
    errors.admin_nombre = 'Nombre de administrador no puede exceder 100 caracteres';
  }

  if (!values.email.trim()) {
    errors.email = 'Email requerido';
  } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email)) {
    errors.email = 'Email inválido';
  }

  if (!values.password) {
    errors.password = 'Contraseña requerida';
  } else if (values.password.length < 8) {
    errors.password = 'Contraseña debe tener al menos 8 caracteres';
  } else if (!/[A-Z]/.test(values.password)) {
    errors.password = 'Contraseña debe contener al menos una letra mayúscula';
  } else if (!/[a-z]/.test(values.password)) {
    errors.password = 'Contraseña debe contener al menos una letra minúscula';
  } else if (!/[0-9]/.test(values.password)) {
    errors.password = 'Contraseña debe contener al menos un dígito';
  }

  if (!values.confirm_password) {
    errors.confirm_password = 'Debe confirmar la contraseña';
  } else if (values.password !== values.confirm_password) {
    errors.confirm_password = 'Las contraseñas no coinciden';
  }

  return errors;
}

/* ---------- Main Component ---------- */

function Onboarding() {
  const [step, setStep] = useState<Step>('registro');
  const [accessToken, setAccessToken] = useState<string>('');

  return (
    <div className="onboarding-page">
      <div className="onboarding-branding">
        <div className="onboarding-branding-content">
          <div className="onboarding-logo">
            e-<span>NCF</span>
          </div>
          <p className="onboarding-tagline">
            Registre su empresa y comience a facturar electrónicamente en minutos.
          </p>
          <div className="onboarding-benefits">
            <div className="benefit-item">
              <span className="benefit-icon">⚡</span>
              <div>
                <strong>Rápido</strong>
                <p>Registro en 3 pasos simples</p>
              </div>
            </div>
            <div className="benefit-item">
              <span className="benefit-icon">🔒</span>
              <div>
                <strong>Seguro</strong>
                <p>Firma digital y cifrado de datos</p>
              </div>
            </div>
            <div className="benefit-item">
              <span className="benefit-icon">✅</span>
              <div>
                <strong>Certificado</strong>
                <p>Cumple con normativa DGII</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="onboarding-form-panel">
        <div className="onboarding-card">
          <StepIndicator current={step} />

          {step === 'registro' && (
            <RegistroStep
              onSuccess={(token) => {
                setAccessToken(token);
                setStep('certificado');
              }}
            />
          )}

          {step === 'certificado' && (
            <CertificadoStep
              accessToken={accessToken}
              onSuccess={() => setStep('confirmacion')}
            />
          )}

          {step === 'confirmacion' && <ConfirmacionStep />}
        </div>
      </div>
    </div>
  );
}

/* ---------- Step Indicator ---------- */

function StepIndicator({ current }: { current: Step }) {
  const steps: { key: Step; label: string }[] = [
    { key: 'registro', label: 'Registro' },
    { key: 'certificado', label: 'Certificado' },
    { key: 'confirmacion', label: 'Listo' },
  ];

  const currentIndex = steps.findIndex((s) => s.key === current);

  return (
    <nav className="onboarding-steps" aria-label="Progreso del registro">
      {steps.map((s, i) => {
        let className = 'step-indicator';
        if (i < currentIndex) className += ' completed';
        else if (i === currentIndex) className += ' active';

        return (
          <div key={s.key} className={className} aria-current={i === currentIndex ? 'step' : undefined}>
            <span className="step-number">{i + 1}</span>
            <span className="step-label">{s.label}</span>
          </div>
        );
      })}
    </nav>
  );
}

/* ---------- Step 1: Registro ---------- */

function RegistroStep({ onSuccess }: { onSuccess: (token: string) => void }) {
  const [values, setValues] = useState({
    empresa_nombre: '',
    rnc: '',
    admin_nombre: '',
    email: '',
    password: '',
    confirm_password: '',
  });
  const [errors, setErrors] = useState<FieldErrors>({});
  const [generalError, setGeneralError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleChange = useCallback(
    (field: keyof typeof values) => (e: React.ChangeEvent<HTMLInputElement>) => {
      setValues((prev) => ({ ...prev, [field]: e.target.value }));
      setErrors((prev) => ({ ...prev, [field]: undefined }));
      setGeneralError('');
    },
    [],
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const validationErrors = validateRegistroForm(values);
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      return;
    }

    setSubmitting(true);
    setGeneralError('');

    try {
      const registerRes = await fetch('/api/v1/onboarding/registro', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values),
      });

      if (!registerRes.ok) {
        const body = await registerRes.json();

        if (registerRes.status === 409) {
          const message: string = body.message || '';
          if (/rnc/i.test(message)) {
            setErrors({ rnc: 'RNC ya se encuentra registrado' });
          } else if (/correo|email/i.test(message)) {
            setErrors({ email: 'Correo electrónico ya se encuentra registrado' });
          } else {
            setGeneralError(message || 'El recurso ya existe');
          }
          return;
        }

        if (registerRes.status === 400 && Array.isArray(body.errors)) {
          const fieldErrors: FieldErrors = {};
          for (const err of body.errors) {
            const path = err.path as keyof FieldErrors;
            if (path && !fieldErrors[path]) {
              fieldErrors[path] = err.message;
            }
          }
          setErrors(fieldErrors);
          return;
        }

        setGeneralError(body.message || 'Error al registrar. Intente nuevamente.');
        return;
      }

      const loginRes = await fetch('/api/v1/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: values.email, password: values.password }),
      });

      if (!loginRes.ok) {
        setGeneralError('Registro exitoso pero hubo un error al iniciar sesión. Intente iniciar sesión manualmente.');
        return;
      }

      const loginData = await loginRes.json();
      onSuccess(loginData.access_token);
    } catch {
      setGeneralError('Error de conexión. Verifique su red e intente nuevamente.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <div className="onboarding-header">
        <h2>Registro de Empresa</h2>
        <p>Complete los datos para registrar su empresa en el sistema e-NCF.</p>
      </div>

      <form className="onboarding-form" onSubmit={handleSubmit} noValidate>
        {generalError && (
          <div className="form-error" role="alert">
            {generalError}
          </div>
        )}

        <div className="form-row">
          <div className="form-field">
            <label htmlFor="empresa_nombre">Nombre de Empresa</label>
            <input
              id="empresa_nombre"
              type="text"
              maxLength={150}
              value={values.empresa_nombre}
              onChange={handleChange('empresa_nombre')}
              aria-invalid={!!errors.empresa_nombre}
              aria-describedby={errors.empresa_nombre ? 'err-empresa_nombre' : undefined}
              autoComplete="organization"
            />
            <span id="err-empresa_nombre" className="field-error" role="alert">
              {errors.empresa_nombre || ''}
            </span>
          </div>

          <div className="form-field">
            <label htmlFor="rnc">RNC</label>
            <input
              id="rnc"
              type="text"
              maxLength={11}
              value={values.rnc}
              onChange={handleChange('rnc')}
              aria-invalid={!!errors.rnc}
              aria-describedby={errors.rnc ? 'err-rnc' : undefined}
              placeholder="9 u 11 caracteres"
            />
            <span id="err-rnc" className="field-error" role="alert">
              {errors.rnc || ''}
            </span>
          </div>
        </div>

        <div className="form-row">
          <div className="form-field">
            <label htmlFor="admin_nombre">Nombre del Administrador</label>
            <input
              id="admin_nombre"
              type="text"
              maxLength={100}
              value={values.admin_nombre}
              onChange={handleChange('admin_nombre')}
              aria-invalid={!!errors.admin_nombre}
              aria-describedby={errors.admin_nombre ? 'err-admin_nombre' : undefined}
              autoComplete="name"
            />
            <span id="err-admin_nombre" className="field-error" role="alert">
              {errors.admin_nombre || ''}
            </span>
          </div>

          <div className="form-field">
            <label htmlFor="email">Correo Electrónico</label>
            <input
              id="email"
              type="email"
              value={values.email}
              onChange={handleChange('email')}
              aria-invalid={!!errors.email}
              aria-describedby={errors.email ? 'err-email' : undefined}
              autoComplete="email"
            />
            <span id="err-email" className="field-error" role="alert">
              {errors.email || ''}
            </span>
          </div>
        </div>

        <div className="form-row">
          <div className="form-field">
            <label htmlFor="password">Contraseña</label>
            <input
              id="password"
              type="password"
              value={values.password}
              onChange={handleChange('password')}
              aria-invalid={!!errors.password}
              aria-describedby={errors.password ? 'err-password' : undefined}
              autoComplete="new-password"
            />
            <span id="err-password" className="field-error" role="alert">
              {errors.password || ''}
            </span>
          </div>

          <div className="form-field">
            <label htmlFor="confirm_password">Confirmar Contraseña</label>
            <input
              id="confirm_password"
              type="password"
              value={values.confirm_password}
              onChange={handleChange('confirm_password')}
              aria-invalid={!!errors.confirm_password}
              aria-describedby={errors.confirm_password ? 'err-confirm_password' : undefined}
              autoComplete="new-password"
            />
            <span id="err-confirm_password" className="field-error" role="alert">
              {errors.confirm_password || ''}
            </span>
          </div>
        </div>

        <div className="form-submit">
          <button type="submit" className="btn-primary" disabled={submitting}>
            {submitting ? 'Registrando...' : 'Registrar Empresa'}
          </button>
        </div>
      </form>

      <div className="onboarding-footer">
        <p>¿Ya tienes cuenta? <Link to="/login">Iniciar Sesión</Link></p>
        <p style={{ marginTop: '0.5rem', fontSize: '0.78rem', color: '#6b7280' }}>
          <Link to="/registro-contador" style={{ color: '#1a3a5c', fontWeight: 500 }}>¿Eres contador? Regístrate aquí</Link>
        </p>
      </div>
    </>
  );
}

/* ---------- Step 2: Certificado ---------- */

function CertificadoStep({
  accessToken,
  onSuccess,
}: {
  accessToken: string;
  onSuccess: () => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [certPassword, setCertPassword] = useState('');
  const [errors, setErrors] = useState<CertErrors>({});
  const [submitting, setSubmitting] = useState(false);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0] || null;
    setErrors({});

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
        const message: string = body.message || 'Error al procesar el certificado';

        if (/expirado|expired/i.test(message)) {
          setErrors({ general: `Certificado expirado: ${message}. Seleccione otro archivo.` });
        } else if (/rnc.*no coincide|mismatch/i.test(message)) {
          setErrors({ general: `El RNC del certificado no coincide con el RNC de la empresa. Seleccione otro archivo.` });
        } else if (/formato|format|invalid/i.test(message)) {
          setErrors({ general: `Certificado inválido: ${message}` });
        } else {
          setErrors({ general: message });
        }

        setFile(null);
        return;
      }

      onSuccess();
    } catch {
      setErrors({ general: 'Error de conexión. Verifique su red e intente nuevamente.' });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <div className="onboarding-header">
        <h2>Cargar Certificado Digital</h2>
        <p>Cargue el certificado digital (.p12 o .pfx) emitido para su empresa.</p>
      </div>

      <form className="onboarding-form" onSubmit={handleSubmit} noValidate>
        {errors.general && (
          <div className="form-error" role="alert">
            {errors.general}
          </div>
        )}

        <div className="form-field">
          <label htmlFor="certificado">Archivo de Certificado</label>
          <div className="cert-upload-area">
            <label htmlFor="certificado" className="cert-upload-label">
              Seleccionar archivo
            </label>
            <input
              id="certificado"
              type="file"
              accept=".p12,.pfx"
              onChange={handleFileChange}
              aria-invalid={!!errors.file}
              aria-describedby={errors.file ? 'err-cert-file' : undefined}
            />
            <p className="cert-upload-hint">Formatos aceptados: .p12, .pfx — Máximo 10MB</p>
            {file && <p className="cert-file-selected">{file.name}</p>}
          </div>
          <span id="err-cert-file" className="field-error" role="alert">
            {errors.file || ''}
          </span>
        </div>

        <div className="form-field">
          <label htmlFor="cert_password">Contraseña del Certificado</label>
          <input
            id="cert_password"
            type="password"
            value={certPassword}
            onChange={(e) => {
              setCertPassword(e.target.value);
              setErrors((prev) => ({ ...prev, password: undefined }));
            }}
            aria-invalid={!!errors.password}
            aria-describedby={errors.password ? 'err-cert-password' : undefined}
          />
          <span id="err-cert-password" className="field-error" role="alert">
            {errors.password || ''}
          </span>
        </div>

        <div className="form-submit">
          <button type="submit" className="btn-primary" disabled={submitting}>
            {submitting ? 'Cargando certificado...' : 'Cargar Certificado'}
          </button>
        </div>
      </form>
    </>
  );
}

/* ---------- Step 3: Confirmación ---------- */

function ConfirmacionStep() {
  return (
    <>
      <div className="onboarding-header">
        <h2>Registro Completado</h2>
      </div>

      <div className="confirmation">
        <div className="confirmation-icon" aria-hidden="true" />
        <h3>¡Empresa activada exitosamente!</h3>
        <p>
          Su empresa ha sido registrada y el certificado digital ha sido verificado correctamente.
          Ya puede comenzar a emitir comprobantes fiscales electrónicos.
        </p>
        <Link to="/dashboard" className="btn-secondary">
          Ir al Inicio
        </Link>
      </div>
    </>
  );
}

export default Onboarding;
