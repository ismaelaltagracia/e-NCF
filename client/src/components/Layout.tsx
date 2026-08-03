import { useState, useEffect } from 'react';
import { NavLink, Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import './Layout.css';

const navItems = [
  { to: '/dashboard', label: 'Inicio', icon: '🏠' },
  { to: '/facturas', label: 'Facturas', icon: '🧾' },
  { to: '/facturas/batch', label: 'Carga masiva', icon: '📂' },
  { to: '/reportes', label: 'Reportes', icon: '📊' },
  { to: '/facturas-recibidas', label: 'Recibidas', icon: '📥' },
  { to: '/catalogo', label: 'Catálogo', icon: '📦' },
  { to: '/secuencias-ncf', label: 'Secuencias', icon: '🔢' },
  { to: '/certificacion', label: 'Certificación', icon: '🏅' },
  { to: '/configuracion', label: 'Configuración', icon: '⚙️' },
  { to: '/mi-plan', label: 'Mi Plan', icon: '📋' },
  { to: '/usuarios', label: 'Usuarios', icon: '👥' },
];

const adminNavItems = [
  { to: '/admin/empresas', label: 'Empresas', icon: '🏢' },
  { to: '/admin/planes', label: 'Planes', icon: '💎' },
  { to: '/admin/auditoria', label: 'Auditoría', icon: '📊' },
];

const publicNavItems = [
  { to: '/planes', label: 'Planes', icon: '💎' },
  { to: '/documentacion', label: 'Docs', icon: '📖' },
  { to: '/login', label: 'Ingresar', icon: '🔑' },
  { to: '/registro', label: 'Registro', icon: '✏️' },
];

const breadcrumbLabels: Record<string, string> = {
  dashboard: 'Inicio',
  facturas: 'Facturas',
  nueva: 'Nueva Factura',
  batch: 'Carga Masiva',
  reportes: 'Reportes Fiscales',
  'facturas-recibidas': 'Facturas Recibidas',
  catalogo: 'Catálogo',
  'secuencias-ncf': 'Secuencias de Comprobantes',
  certificacion: 'Certificación',
  configuracion: 'Configuración',
  'mi-plan': 'Mi Plan',
  usuarios: 'Usuarios',
  'api-keys': 'API Keys',
  planes: 'Planes',
  documentacion: 'Documentación',
  admin: 'Admin',
  empresas: 'Empresas',
  auditoria: 'Auditoría',
};

function Layout() {
  const { isAuthenticated, userRole, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(false);
  const [permiteApi, setPermiteApi] = useState(false);
  const [userName, setUserName] = useState('');
  const [certAlert, setCertAlert] = useState<{ estado: string; dias_restantes: number | null; vence_en: string | null } | null>(null);
  const [dgiiStatus, setDgiiStatus] = useState<'conectado' | 'contingencia' | 'verificando'>('conectado');

  const isSuperAdmin = userRole === 'super_admin';

  useEffect(() => {
    if (isAuthenticated && !isSuperAdmin) {
      const token = localStorage.getItem('access_token');
      fetch('/api/v1/empresas/me/permisos', {
        headers: { Authorization: `Bearer ${token}` },
      })
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (data) setPermiteApi(data.permite_api);
        })
        .catch(() => {});

      fetch('/api/v1/empresas/me/certificado-estado', {
        headers: { Authorization: `Bearer ${token}` },
      })
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (data && (data.estado === 'por_vencer' || data.estado === 'vencido' || data.estado === 'sin_certificado')) {
            setCertAlert(data);
          }
        })
        .catch(() => {});
    }
  }, [isAuthenticated, isSuperAdmin]);

  useEffect(() => {
    if (isAuthenticated) {
      const token = localStorage.getItem('access_token');
      if (token) {
        try {
          const payload = JSON.parse(atob(token.split('.')[1]));
          setUserName(payload.empresa_nombre || payload.email || 'Usuario');
        } catch {
          setUserName('Usuario');
        }
      }
    }
  }, [isAuthenticated]);

  // Poll DGII connection status every 30s
  useEffect(() => {
    if (!isAuthenticated || isSuperAdmin) return;
    const token = localStorage.getItem('access_token');

    const checkDgii = () => {
      fetch('/api/v1/dgii/estado-conexion', {
        headers: { Authorization: `Bearer ${token}` },
      })
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (data) setDgiiStatus(data.estado);
        })
        .catch(() => {});
    };

    checkDgii();
    const interval = setInterval(checkDgii, 30_000);
    return () => clearInterval(interval);
  }, [isAuthenticated, isSuperAdmin]);

  const handleLogout = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  const buildBreadcrumb = () => {
    const segments = location.pathname.split('/').filter(Boolean);
    return segments.map((seg) => breadcrumbLabels[seg] || seg);
  };

  const breadcrumbs = buildBreadcrumb();

  if (location.pathname === '/login' || location.pathname === '/registro' || location.pathname === '/inicio') {
    return <Outlet />;
  }

  const currentNavItems = isSuperAdmin
    ? adminNavItems
    : isAuthenticated
      ? [...navItems, ...(permiteApi ? [{ to: '/api-keys', label: 'API Keys', icon: '🔐' }] : [])]
      : publicNavItems;

  return (
    <div className={`layout ${collapsed ? 'layout--collapsed' : ''}`}>
      <aside className="sidebar" aria-label="Navegación principal">
        <div className="sidebar-top">
          <div className="sidebar-logo">
            <span className="logo-text">e-<span className="logo-highlight">NCF</span></span>
            {!collapsed && isSuperAdmin && <span className="logo-badge">Admin</span>}
          </div>
          <button
            className="sidebar-toggle"
            onClick={() => setCollapsed(!collapsed)}
            aria-label={collapsed ? 'Expandir menú' : 'Colapsar menú'}
          >
            {collapsed ? '▶' : '◀'}
          </button>
        </div>

        <nav className="sidebar-nav">
          {currentNavItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `sidebar-link ${isActive ? 'sidebar-link--active' : ''}`
              }
              title={collapsed ? item.label : undefined}
            >
              <span className="sidebar-link-icon">{item.icon}</span>
              {!collapsed && <span className="sidebar-link-label">{item.label}</span>}
            </NavLink>
          ))}
        </nav>

        {isAuthenticated && (
          <div className="sidebar-bottom">
            {dgiiStatus !== 'conectado' && (
              <div className={`sidebar-dgii-status sidebar-dgii-status--${dgiiStatus}`} title={
                dgiiStatus === 'contingencia'
                  ? 'DGII no disponible. Las facturas se transmitirán automáticamente.'
                  : 'Verificando conexión con DGII...'
              }>
                <span className="sidebar-link-icon">{dgiiStatus === 'contingencia' ? '🟡' : '🔄'}</span>
                {!collapsed && (
                  <span className="sidebar-link-label">
                    {dgiiStatus === 'contingencia' ? 'Modo contingencia' : 'Verificando DGII'}
                  </span>
                )}
              </div>
            )}
            <div className="sidebar-user" title={userName}>
              <span className="sidebar-user-avatar">👤</span>
              {!collapsed && (
                <span className="sidebar-user-name">{userName}</span>
              )}
            </div>
            <button
              className="sidebar-logout"
              onClick={handleLogout}
              title="Cerrar Sesión"
            >
              <span className="sidebar-link-icon">🚪</span>
              {!collapsed && <span className="sidebar-link-label">Salir</span>}
            </button>
          </div>
        )}
      </aside>

      <div className="layout-main">
        {certAlert && (
          <div className={`cert-alert cert-alert--${certAlert.estado}`}>
            {certAlert.estado === 'vencido' && '⛔ Su certificado digital ha vencido. No podrá firmar facturas hasta renovarlo.'}
            {certAlert.estado === 'por_vencer' && `⚠️ Su certificado digital vence en ${certAlert.dias_restantes} día${certAlert.dias_restantes !== 1 ? 's' : ''} (${new Date(certAlert.vence_en!).toLocaleDateString('es-DO')}). Renuévelo pronto.`}
            {certAlert.estado === 'sin_certificado' && '⚠️ No tiene certificado digital cargado. Cargue su certificado .p12 en Configuración para poder facturar.'}
          </div>
        )}

        <header className="layout-header">
          <nav className="breadcrumb" aria-label="Breadcrumb">
            {breadcrumbs.map((crumb, idx) => (
              <span key={idx} className="breadcrumb-item">
                {idx > 0 && <span className="breadcrumb-sep">/</span>}
                {crumb}
              </span>
            ))}
          </nav>
        </header>

        <main className="layout-content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

export default Layout;
