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
      navigate('/facturas', { replace: true });
    } catch {
      setGeneralError('Error de conexión. Verifique su red e intente nuevamente.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="login">
      <div className="login-header">
        <h2>Iniciar Sesión</h2>
        <p>Ingrese sus credenciales para acceder al sistema e-NCF.</p>
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

      <div className="login-footer">
        <p>¿No tienes cuenta? <Link to="/registro">Registra tu empresa</Link></p>
      </div>
    </div>
  );
}

export default Login;
