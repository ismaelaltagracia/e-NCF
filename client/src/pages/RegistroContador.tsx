import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import './Login.css'; // Reuse login split-screen styles

function RegistroContador() {
  const [step, setStep] = useState<'datos' | 'listo'>('datos');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const { login } = useAuth();
  const navigate = useNavigate();

  const [form, setForm] = useState({
    admin_nombre: '',
    email: '',
    password: '',
    confirm_password: '',
    nombre_firma: '',
    rnc_firma: '',
    exequatur: '',
  });

  const handleChange = (field: string) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm((prev) => ({ ...prev, [field]: e.target.value }));
    setError('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (form.password !== form.confirm_password) {
      setError('Las contraseñas no coinciden');
      return;
    }
    setSubmitting(true);
    setError('');

    try {
      // Step 1: Register as user (create empresa placeholder for the firma)
      const regRes = await fetch('/api/v1/onboarding/registro', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          empresa_nombre: form.nombre_firma || `Firma ${form.admin_nombre}`,
          rnc: form.rnc_firma || '000000000', // placeholder if no RNC
          admin_nombre: form.admin_nombre,
          email: form.email,
          password: form.password,
          confirm_password: form.confirm_password,
        }),
      });

      if (!regRes.ok) {
        const body = await regRes.json();
        setError(body.message || 'Error al registrar');
        return;
      }

      // Step 2: Login
      const loginRes = await fetch('/api/v1/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: form.email, password: form.password }),
      });

      if (!loginRes.ok) {
        setError('Registro exitoso pero error al iniciar sesión');
        return;
      }

      const loginData = await loginRes.json();
      login(loginData.access_token, loginData.refresh_token);

      // Step 3: Register as contador
      await fetch('/api/v1/contador/registro', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${loginData.access_token}`,
        },
        body: JSON.stringify({
          nombre_firma: form.nombre_firma || `Firma ${form.admin_nombre}`,
          rnc_firma: form.rnc_firma || undefined,
          exequatur: form.exequatur || undefined,
          email_facturacion: form.email,
        }),
      });

      setStep('listo');
    } catch {
      setError('Error de conexión');
    } finally {
      setSubmitting(false);
    }
  };

  if (step === 'listo') {
    return (
      <div className="login-page">
        <div className="login-branding">
          <div className="branding-content">
            <div className="branding-logo">e-<span>NCF</span></div>
            <p className="branding-tagline">
              Gestione la facturación electrónica de todos sus clientes desde un solo lugar.
            </p>
          </div>
        </div>
        <div className="login-form-panel">
          <div className="login-card" style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>✅</div>
            <h2 style={{ marginBottom: '0.5rem' }}>¡Registro completado!</h2>
            <p style={{ color: '#6b7280', marginBottom: '1.5rem' }}>
              Ya puede agregar las empresas de sus clientes.
            </p>
            <button
              onClick={() => navigate('/contador', { replace: true })}
              style={{
                padding: '0.8rem 2rem',
                border: 'none',
                borderRadius: '10px',
                background: 'linear-gradient(135deg, #0f1b2d, #1a3a5c)',
                color: '#fff',
                fontSize: '0.95rem',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Ir a Mis Empresas
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="login-page">
      <div className="login-branding">
        <div className="branding-content">
          <div className="branding-logo">e-<span>NCF</span></div>
          <p className="branding-tagline">
            Gestione la facturación electrónica de todos sus clientes desde un solo lugar.
          </p>
          <ul className="branding-features">
            <li>✓ Un solo login para todas sus empresas</li>
            <li>✓ 20% de descuento a partir de la 3ra empresa</li>
            <li>✓ Reportes 606/607/608 centralizados</li>
            <li>✓ Facturación consolidada mensual</li>
          </ul>
        </div>
      </div>

      <div className="login-form-panel">
        <div className="login-card">
          <div className="login-card-header">
            <h2>Registro de Contador</h2>
            <p>Complete sus datos para gestionar múltiples empresas</p>
          </div>

          <form className="login-form" onSubmit={handleSubmit} noValidate>
            {error && <div className="form-error" role="alert">{error}</div>}

            <div className="form-field">
              <label>Nombre completo</label>
              <input value={form.admin_nombre} onChange={handleChange('admin_nombre')} placeholder="Ej: Juan Martínez" />
            </div>
            <div className="form-field">
              <label>Nombre de la firma</label>
              <input value={form.nombre_firma} onChange={handleChange('nombre_firma')} placeholder="Ej: Martínez & Asociados CPA" />
            </div>
            <div className="form-field">
              <label>RNC de la firma (opcional)</label>
              <input value={form.rnc_firma} onChange={handleChange('rnc_firma')} placeholder="9 u 11 dígitos" maxLength={11} />
            </div>
            <div className="form-field">
              <label>No. Exequátur (opcional)</label>
              <input value={form.exequatur} onChange={handleChange('exequatur')} placeholder="Número de exequátur" />
            </div>
            <div className="form-field">
              <label>Correo electrónico</label>
              <input type="email" value={form.email} onChange={handleChange('email')} placeholder="correo@firma.com" />
            </div>
            <div className="form-field">
              <label>Contraseña</label>
              <input type="password" value={form.password} onChange={handleChange('password')} placeholder="Mínimo 8 caracteres" />
            </div>
            <div className="form-field">
              <label>Confirmar contraseña</label>
              <input type="password" value={form.confirm_password} onChange={handleChange('confirm_password')} />
            </div>

            <div className="form-submit">
              <button type="submit" className="btn-primary" disabled={submitting}>
                {submitting ? 'Registrando...' : 'Crear cuenta de contador'}
              </button>
            </div>
          </form>

          <div className="login-card-footer">
            <p>¿Ya tienes cuenta? <Link to="/login">Iniciar Sesión</Link></p>
            <div className="login-card-links">
              <Link to="/registro">Registro de empresa (no soy contador)</Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default RegistroContador;
