import { useState } from 'react';
import { Link } from 'react-router-dom';
import './Login.css';

function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!email.trim()) {
      setError('Email requerido');
      return;
    }

    setSubmitting(true);
    setError('');

    try {
      const res = await fetch('/api/v1/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.message || 'No se pudo procesar la solicitud. Intenta de nuevo.');
        return;
      }

      // Respuesta genérica: siempre 200 aunque el correo no exista.
      setSent(true);
    } catch {
      setError('Error de conexión. Verifica tu red e intenta nuevamente.');
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
          <p className="branding-tagline">
            Recupera el acceso a tu cuenta de forma segura.
          </p>
        </div>
      </div>

      <div className="login-form-panel">
        <div className="login-card">
          <div className="login-card-header">
            <h2>Recuperar contraseña</h2>
            <p>Te enviaremos un enlace para restablecerla</p>
          </div>

          {sent ? (
            <div className="login-form">
              <div className="form-success" role="status">
                Si existe una cuenta con ese correo, recibirás un enlace para restablecer tu
                contraseña. Revisa tu bandeja de entrada y la carpeta de spam.
              </div>
              <div className="form-submit">
                <Link to="/login" className="btn-primary btn-block-link">
                  Volver al inicio de sesión
                </Link>
              </div>
            </div>
          ) : (
            <form className="login-form" onSubmit={handleSubmit} noValidate>
              {error && (
                <div className="form-error" role="alert">
                  {error}
                </div>
              )}

              <div className="form-field">
                <label htmlFor="forgot-email">Correo Electrónico</label>
                <input
                  id="forgot-email"
                  type="email"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    setError('');
                  }}
                  placeholder="nombre@empresa.com"
                  autoComplete="email"
                />
              </div>

              <div className="form-submit">
                <button type="submit" className="btn-primary" disabled={submitting}>
                  {submitting ? 'Enviando...' : 'Enviar enlace'}
                </button>
              </div>
            </form>
          )}

          <div className="login-card-footer">
            <p>
              ¿Ya la recordaste? <Link to="/login">Inicia sesión</Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default ForgotPassword;
