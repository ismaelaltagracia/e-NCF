import { Link } from 'react-router-dom';
import { useEffect, useState } from 'react';
import './Landing.css';

interface Plan {
  id: string;
  nombre: string;
  limite_facturas_mensual: number | null;
  precio: string;
  activo: boolean;
  permite_api: boolean;
}

function Landing() {
  const [planes, setPlanes] = useState<Plan[]>([]);

  useEffect(() => {
    fetch('/api/v1/planes')
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => setPlanes(data.filter((p: Plan) => p.activo && !p.permite_api)))
      .catch(() => {});
  }, []);

  return (
    <div className="landing">
      {/* ─── Header ─── */}
      <header className="landing-header">
        <div className="landing-header-inner">
          <div className="landing-logo">e-<span>NCF</span></div>
          <nav className="landing-nav">
            <a href="#funciones">Funciones</a>
            <a href="#precios">Precios</a>
            <a href="#faq">Preguntas</a>
            <Link to="/documentacion" className="landing-nav-link">API Docs</Link>
            <Link to="/login" className="landing-btn-login">Ingresar</Link>
          </nav>
        </div>
      </header>

      {/* ─── Hero ─── */}
      <section className="landing-hero">
        <div className="landing-hero-inner">
          <h1>Facturación electrónica <br />sin complicaciones</h1>
          <p className="hero-sub">
            Emite comprobantes fiscales electrónicos, cumple con la DGII, y olvídate de la complejidad técnica.
            Sin costo por factura. Sin contratos.
          </p>
          <div className="hero-ctas">
            <Link to="/registro" className="hero-btn-primary">Registra tu empresa gratis</Link>
            <Link to="/documentacion" className="hero-btn-secondary">Ver documentación API</Link>
          </div>
          <p className="hero-note">Registro en 3 minutos. Plan gratuito disponible.</p>
        </div>
      </section>

      {/* ─── Urgencia DGII ─── */}
      <section className="landing-urgency">
        <div className="urgency-inner">
          <span className="urgency-icon">⚠️</span>
          <p>
            <strong>Fecha límite DGII: noviembre 2026.</strong> Todas las pequeñas empresas deben emitir facturas electrónicas.
            No esperes al último momento.
          </p>
        </div>
      </section>

      {/* ─── Funciones ─── */}
      <section className="landing-features" id="funciones">
        <div className="features-inner">
          <h2>Todo lo que necesitas para facturar electrónicamente</h2>
          <p className="features-sub">Sin jerga técnica. Sin complicaciones. Funciona desde el día uno.</p>

          <div className="features-grid">
            <div className="feature-card">
              <span className="feature-icon">🧾</span>
              <h3>Emite facturas</h3>
              <p>Crea y envía facturas electrónicas directamente a la DGII. Todo firmado digitalmente.</p>
            </div>
            <div className="feature-card">
              <span className="feature-icon">📄</span>
              <h3>PDF con QR</h3>
              <p>Genera un PDF profesional con código QR de verificación DGII para entregarle a tu cliente.</p>
            </div>
            <div className="feature-card">
              <span className="feature-icon">📂</span>
              <h3>Carga masiva</h3>
              <p>Sube un Excel con todas tus facturas y emítelas de una vez. Ideal si facturas en volumen.</p>
            </div>
            <div className="feature-card">
              <span className="feature-icon">📥</span>
              <h3>Recibe facturas</h3>
              <p>Registra facturas recibidas, apruébalas o recházalas comercialmente ante la DGII.</p>
            </div>
            <div className="feature-card">
              <span className="feature-icon">📊</span>
              <h3>Reportes 606/607/608</h3>
              <p>Genera los formatos fiscales que tu contador necesita para declarar. Un clic y listo.</p>
            </div>
            <div className="feature-card">
              <span className="feature-icon">🔐</span>
              <h3>API REST</h3>
              <p>Integra tu sistema existente (ERP, POS, web) con nuestra API documentada.</p>
            </div>
            <div className="feature-card">
              <span className="feature-icon">🟡</span>
              <h3>Modo contingencia</h3>
              <p>Si la DGII se cae, sigues facturando. Se transmite automáticamente cuando vuelva.</p>
            </div>
            <div className="feature-card">
              <span className="feature-icon">✉️</span>
              <h3>Email automático</h3>
              <p>El PDF se envía directo al correo de tu cliente con un clic. Sin salir de la plataforma.</p>
            </div>
          </div>
        </div>
      </section>

      {/* ─── Integración Transparente ─── */}
      <section className="landing-transparent">
        <div className="transparent-inner">
          <div className="transparent-content">
            <span className="transparent-badge">No cambies tu software</span>
            <h2>Integración transparente con tu sistema actual</h2>
            <p className="transparent-desc">
              ¿Ya tienes un programa de facturación? No lo cambies. Instalamos un componente 
              invisible en tu computadora que se encarga de enviar todo a la DGII automáticamente. 
              Tú sigues trabajando exactamente igual.
            </p>
            <div className="transparent-steps">
              <div className="transparent-step">
                <span className="transparent-step-num">1</span>
                <div>
                  <strong>Instalación en 5 minutos</strong>
                  <p>Un técnico configura el componente en tu PC de forma remota.</p>
                </div>
              </div>
              <div className="transparent-step">
                <span className="transparent-step-num">2</span>
                <div>
                  <strong>Sigues facturando como siempre</strong>
                  <p>Usa tu Excel, tu POS, tu sistema contable. Sin aprender nada nuevo.</p>
                </div>
              </div>
              <div className="transparent-step">
                <span className="transparent-step-num">3</span>
                <div>
                  <strong>La DGII recibe todo automáticamente</strong>
                  <p>Cada factura se envía, se firma, y sale con su número de comprobante y código QR.</p>
                </div>
              </div>
            </div>
            <p className="transparent-compat">
              Compatible con: Excel, Mónica, ContaPyme, Softland, cualquier POS, y sistemas propios.
            </p>
          </div>
        </div>
      </section>

      {/* ─── Para quién ─── */}
      <section className="landing-audience">
        <div className="audience-inner">
          <h2>¿Para quién es esto?</h2>
          <div className="audience-grid">
            <div className="audience-card">
              <span className="audience-icon">🏪</span>
              <h3>PyMEs y comercios</h3>
              <p>No necesitas un técnico. Registra tu empresa, carga tu certificado, y empieza a facturar hoy.</p>
            </div>
            <div className="audience-card">
              <span className="audience-icon">📋</span>
              <h3>Contadores</h3>
              <p>Gestiona la facturación de todos tus clientes desde un solo lugar. Descarga los 606/607/608 al instante.</p>
            </div>
            <div className="audience-card">
              <span className="audience-icon">💻</span>
              <h3>Desarrolladores</h3>
              <p>API REST documentada. Firma digital incluida. Integra en una tarde con tu lenguaje favorito.</p>
            </div>
          </div>
        </div>
      </section>

      {/* ─── Precios ─── */}
      <section className="landing-pricing" id="precios">
        <div className="pricing-inner">
          <h2>Precios simples, sin sorpresas</h2>
          <p className="pricing-sub">Sin costo por factura. Paga un monto fijo mensual según tu volumen.</p>

          {planes.length > 0 && (
            <div className="pricing-grid">
              {planes.slice(0, 3).map((plan, idx) => (
                <div key={plan.id} className={`pricing-card ${idx === 1 ? 'pricing-card--featured' : ''}`}>
                  {idx === 1 && <span className="pricing-badge">Popular</span>}
                  <h3>{plan.nombre}</h3>
                  <div className="pricing-amount">
                    <span className="pricing-currency">RD$</span>
                    <span className="pricing-value">{Number(plan.precio).toLocaleString('es-DO')}</span>
                    <span className="pricing-period">/mes</span>
                  </div>
                  <p className="pricing-limit">
                    {plan.limite_facturas_mensual === null
                      ? 'Facturas ilimitadas'
                      : `Hasta ${plan.limite_facturas_mensual} facturas/mes`}
                  </p>
                  <Link to="/registro" className={`pricing-btn ${idx === 1 ? 'pricing-btn--primary' : ''}`}>
                    Empezar ahora
                  </Link>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* ─── Contadores ─── */}
      <section className="landing-contador">
        <div className="contador-landing-inner">
          <div className="contador-landing-content">
            <span className="contador-landing-badge">Para contadores</span>
            <h2>Gestiona todos tus clientes desde un solo lugar</h2>
            <p className="contador-landing-desc">
              Si eres contador o firma contable, administra la facturación electrónica de todas 
              las empresas de tus clientes con un solo login. Sin cambiar entre cuentas.
            </p>
            <div className="contador-landing-benefits">
              <div className="contador-benefit">
                <span>💰</span>
                <div>
                  <strong>20% de descuento</strong>
                  <p>A partir de la 3ra empresa, cada plan tiene 20% menos.</p>
                </div>
              </div>
              <div className="contador-benefit">
                <span>📊</span>
                <div>
                  <strong>Reportes centralizados</strong>
                  <p>606, 607 y 608 de cada empresa en un clic.</p>
                </div>
              </div>
              <div className="contador-benefit">
                <span>🧾</span>
                <div>
                  <strong>Una sola factura mensual</strong>
                  <p>Facturación consolidada por todas las empresas que gestiones.</p>
                </div>
              </div>
              <div className="contador-benefit">
                <span>👥</span>
                <div>
                  <strong>Equipo con acceso controlado</strong>
                  <p>Crea usuarios y asígnales solo las empresas que deben ver.</p>
                </div>
              </div>
            </div>
            <Link to="/registro-contador" className="contador-landing-btn">
              Registrarme como contador
            </Link>
          </div>
        </div>
      </section>

      {/* ─── FAQ ─── */}
      <section className="landing-faq" id="faq">
        <div className="faq-inner">
          <h2>Preguntas frecuentes</h2>
          <div className="faq-grid">
            <div className="faq-item">
              <h4>¿Necesito un técnico para usar esto?</h4>
              <p>No. La plataforma está diseñada para que cualquier persona pueda facturar. Si sabes enviar un email, sabes usar e-NCF.</p>
            </div>
            <div className="faq-item">
              <h4>¿Qué necesito para empezar?</h4>
              <p>Tu RNC, tu certificado digital (.p12 de la DGII), y 5 minutos. El sistema te guía paso a paso.</p>
            </div>
            <div className="faq-item">
              <h4>¿Cobran por factura emitida?</h4>
              <p>No. Pagas un monto fijo mensual según tu plan. Emite todas las facturas que quieras dentro de tu límite.</p>
            </div>
            <div className="faq-item">
              <h4>¿Qué pasa si la DGII se cae?</h4>
              <p>Sigues facturando normalmente. El sistema almacena las facturas y las transmite automáticamente cuando la DGII vuelva.</p>
            </div>
            <div className="faq-item">
              <h4>¿Puedo integrar mi sistema existente?</h4>
              <p>Sí. Ofrecemos una API REST documentada con la que puedes emitir facturas desde cualquier sistema (ERP, POS, web).</p>
            </div>
            <div className="faq-item">
              <h4>¿Generan los formatos para el contador?</h4>
              <p>Sí. Los formatos 606 (compras), 607 (ventas) y 608 (anulados) se generan automáticamente desde la plataforma.</p>
            </div>
          </div>
        </div>
      </section>

      {/* ─── CTA Final ─── */}
      <section className="landing-cta-final">
        <div className="cta-final-inner">
          <h2>Empieza a facturar electrónicamente hoy</h2>
          <p>Registro gratuito. Sin tarjeta de crédito. Sin contratos.</p>
          <Link to="/registro" className="cta-final-btn">Crear cuenta gratis</Link>
        </div>
      </section>

      {/* ─── Footer ─── */}
      <footer className="landing-footer">
        <div className="footer-inner">
          <div className="footer-brand">e-<span>NCF</span></div>
          <p>Facturación electrónica para la República Dominicana.</p>
          <div className="footer-links">
            <Link to="/planes">Planes</Link>
            <Link to="/documentacion">API</Link>
            <Link to="/login">Ingresar</Link>
            <Link to="/registro">Registro</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}

export default Landing;
