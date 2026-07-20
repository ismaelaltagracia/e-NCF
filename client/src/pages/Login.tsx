import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import './Login.css';

interface LoginErrors {
  email?: string;
  password?: string;
}

function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<LoginErrors>({});
  const [generalError, setGeneralError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const newErrors: LoginErrors = {};
    if (!email.trim()) newErrors.email = 'Email requerido';
    if (!password) newErrors.password = 'Contraseña requerida';

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    setSubmitting(true);
    setGeneralError('');
    setErrors({});

    try {
      const res = await fetch('/api/v1/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      if (!res.ok) {
        const body = await res.json();

        if (res.status === 401) {
          setGeneralError('Credenciales inválidas. Verifique su correo y contraseña.');
        } else if (res.status === 403) {
          setGeneralError(body.message || 'La empresa no está activa. Complete el proceso de activación primero.');
        } else if (res.status === 429) {
          setGeneralError('Demasiados intentos. Intente nuevamente en unos minutos.');
        } else {
          setGeneralError(body.message || 'Error al iniciar sesión.');
        }
        return;
      }

      const data = await res.json();
      login(data.access_token, data.refresh_token);
      navigate('/dashboard', { replace: true });
    } catch {
      setGeneralError('Error de conexión. Verifique su red e intente nuevamente.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-branding">
        <div className="branding-content">
          <div className="branding-logo">
            e-<span>NCF</span>
          </div>
          <p className="branding-tagline">
            Facturación electrónica para la República Dominicana, simple y confiable.
          </p>
          <ul className="branding-features">
            <li>✓ Comprobantes fiscales electrónicos (e-CF)</li>
            <li>✓ Integración directa con DGII</li>
            <li>✓ Firma digital y certificados</li>
            <li>✓ API REST para integración</li>
          </ul>

          <div className="branding-functions">
            <h3>Funciones principales</h3>
            <div className="functions-grid">
              <div className="function-item">
                <span className="function-icon">🧾</span>
                <span className="function-text">Emisión y envío de facturas electrónicas</span>
              </div>
              <div className="function-item">
                <span className="function-icon">📥</span>
                <span className="function-text">Recepción y aprobación de e-CF</span>
              </div>
              <div className="function-item">
                <span className="function-icon">🔢</span>
                <span className="function-text">Gestión de secuencias NCF automáticas</span>
              </div>
              <div className="function-item">
                <span className="function-icon">🏅</span>
                <span className="function-text">Certificación y firma digital P12</span>
              </div>
              <div className="function-item">
                <span className="function-icon">📦</span>
                <span className="function-text">Catálogo de clientes y productos</span>
              </div>
              <div className="function-item">
                <span className="function-icon">🔐</span>
                <span className="function-text">API REST con API Keys para integración</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="login-form-panel">
        <div className="login-card">
          <div className="login-card-header">
            <h2>Iniciar Sesión</h2>
            <p>Ingrese sus credenciales para acceder</p>
          </div>

          <form className="login-form" onSubmit={handleSubmit} noValidate>
            {generalError && (
              <div className="form-error" role="alert">
                {generalError}
              </div>
            )}

            <div className="form-field">
              <label htmlFor="login-email">Correo Electrónico</label>
              <input
                id="login-email"
                type="email"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  setErrors((prev) => ({ ...prev, email: undefined }));
                  setGeneralError('');
                }}
                placeholder="nombre@empresa.com"
                aria-invalid={!!errors.email}
                aria-describedby={errors.email ? 'err-login-email' : undefined}
                autoComplete="email"
              />
              <span id="err-login-email" className="field-error" role="alert">
                {errors.email || ''}
              </span>
            </div>

            <div className="form-field">
              <label htmlFor="login-password">Contraseña</label>
              <input
                id="login-password"
                type="password"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  setErrors((prev) => ({ ...prev, password: undefined }));
                  setGeneralError('');
                }}
                placeholder="••••••••"
                aria-invalid={!!errors.password}
                aria-describedby={errors.password ? 'err-login-password' : undefined}
                autoComplete="current-password"
              />
              <span id="err-login-password" className="field-error" role="alert">
                {errors.password || ''}
              </span>
            </div>

            <div className="form-submit">
              <button type="submit" className="btn-primary" disabled={submitting}>
                {submitting ? 'Iniciando sesión...' : 'Iniciar Sesión'}
              </button>
            </div>
          </form>

          <div className="login-card-footer">
            <p>¿No tienes cuenta? <Link to="/registro">Registra tu empresa</Link></p>
            <div className="login-card-links">
              <Link to="/planes">Ver Planes</Link>
              <Link to="/documentacion">Documentación API</Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default Login;
