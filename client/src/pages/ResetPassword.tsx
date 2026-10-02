import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import './Login.css';

interface ResetErrors {
  password?: string;
  confirm?: string;
}

function validatePasswordComplexity(password: string): string | null {
  if (password.length < 8) return 'Debe tener al menos 8 caracteres';
  if (!/[A-Z]/.test(password)) return 'Debe contener al menos una letra mayúscula';
  if (!/[a-z]/.test(password)) return 'Debe contener al menos una letra minúscula';
  if (!/[0-9]/.test(password)) return 'Debe contener al menos un dígito';
  return null;
}

function ResetPassword() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') ?? '';
  const navigate = useNavigate();

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState<ResetErrors>({});
  const [generalError, setGeneralError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const newErrors: ResetErrors = {};
    const complexityError = validatePasswordComplexity(password);
    if (complexityError) newErrors.password = complexityError;
    if (password !== confirm) newErrors.confirm = 'Las contraseñas no coinciden';

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    setSubmitting(true);
    setGeneralError('');
    setErrors({});

    try {
      const res = await fetch('/api/v1/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password_nueva: password }),
      });

      if (!res.ok) {
        if (res.status === 401) {
          setGeneralError('El enlace de recuperación es inválido o ha expirado. Solicita uno nuevo.');
        } else {
          const body = await res.json().catch(() => ({}));
          setGeneralError(body.message || 'No se pudo restablecer la contraseña.');
        }
        return;
      }

      setDone(true);
      setTimeout(() => navigate('/login', { replace: true }), 2500);
    } catch {
      setGeneralError('Error de conexión. Verifica tu red e intenta nuevamente.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-branding">
        <div className="branding-content">
          <div className="branding-logo">
            E-<span>MITTE</span>
          </div>
          <p className="branding-tagline">Elige una nueva contraseña para tu cuenta.</p>
        </div>
      </div>

      <div className="login-form-panel">
        <div className="login-card">
          <div className="login-card-header">
            <h2>Nueva contraseña</h2>
            <p>Define la contraseña que usarás para acceder</p>
          </div>

          {!token ? (
            <div className="login-form">
              <div className="form-error" role="alert">
                Falta el token de recuperación. Abre el enlace desde el correo que recibiste.
              </div>
              <div className="form-submit">
                <Link to="/forgot-password" className="btn-primary btn-block-link">
                  Solicitar un nuevo enlace
                </Link>
              </div>
            </div>
          ) : done ? (
            <div className="login-form">
              <div className="form-success" role="status">
                Tu contraseña se actualizó correctamente. Redirigiéndote al inicio de sesión...
              </div>
              <div className="form-submit">
                <Link to="/login" className="btn-primary btn-block-link">
                  Ir a iniciar sesión
                </Link>
              </div>
            </div>
          ) : (
            <form className="login-form" onSubmit={handleSubmit} noValidate>
              {generalError && (
                <div className="form-error" role="alert">
                  {generalError}
                </div>
              )}

              <div className="form-field">
                <label htmlFor="reset-password">Nueva contraseña</label>
                <div className="password-input-wrapper">
                  <input
                    id="reset-password"
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => {
                      setPassword(e.target.value);
                      setErrors((prev) => ({ ...prev, password: undefined }));
                      setGeneralError('');
                    }}
                    placeholder="••••••••"
                    aria-invalid={!!errors.password}
                    autoComplete="new-password"
                  />
                  <button
                    type="button"
                    className="password-toggle"
                    onClick={() => setShowPassword((prev) => !prev)}
                    aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                    aria-pressed={showPassword}
                    title={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                  >
                    {showPassword ? '🙈' : '👁️'}
                  </button>
                </div>
                <span className="field-error" role="alert">
                  {errors.password || ''}
                </span>
              </div>

              <div className="form-field">
                <label htmlFor="reset-confirm">Confirmar contraseña</label>
                <input
                  id="reset-confirm"
                  type={showPassword ? 'text' : 'password'}
                  value={confirm}
                  onChange={(e) => {
                    setConfirm(e.target.value);
                    setErrors((prev) => ({ ...prev, confirm: undefined }));
                    setGeneralError('');
                  }}
                  placeholder="••••••••"
                  aria-invalid={!!errors.confirm}
                  autoComplete="new-password"
                />
                <span className="field-error" role="alert">
                  {errors.confirm || ''}
                </span>
              </div>

              <div className="form-submit">
                <button type="submit" className="btn-primary" disabled={submitting}>
                  {submitting ? 'Guardando...' : 'Restablecer contraseña'}
                </button>
              </div>
            </form>
          )}

          <div className="login-card-footer">
            <p>
              <Link to="/login">Volver al inicio de sesión</Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default ResetPassword;
