import { useState, useEffect } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import './Layout.css';

function Layout() {
  const { isAuthenticated, userRole, logout } = useAuth();
  const navigate = useNavigate();
  const [permiteApi, setPermiteApi] = useState(false);
  const [certAlert, setCertAlert] = useState<{ estado: string; dias_restantes: number | null; vence_en: string | null } | null>(null);

  const isSuperAdmin = userRole === 'super_admin';

  useEffect(() => {
    if (isAuthenticated && !isSuperAdmin) {
      const token = localStorage.getItem('access_token');
      // Fetch permisos
      fetch('/api/v1/empresas/me/permisos', {
        headers: { Authorization: `Bearer ${token}` },
      })
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (data) setPermiteApi(data.permite_api);
        })
        .catch(() => {});
      // Fetch certificado estado
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

  const handleLogout = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  return (
    <div className="layout">
      <header className="layout-header">
        <h1 className="layout-title">e-NCF{isSuperAdmin ? ' · Admin' : ''}</h1>
        <nav className="layout-nav" aria-label="Navegación principal">
          {isAuthenticated && isSuperAdmin ? (
            <>
              <NavLink to="/admin/empresas" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
                Empresas
              </NavLink>
              <NavLink to="/admin/planes" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
                Planes
              </NavLink>
              <NavLink to="/admin/auditoria" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
                Auditoría
              </NavLink>
              <button className="nav-link logout-btn" onClick={handleLogout}>
                Cerrar Sesión
              </button>
            </>
          ) : isAuthenticated ? (
            <>
              <NavLink to="/facturas" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
                Facturas
              </NavLink>
              <NavLink to="/facturas-recibidas" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
                Recibidas
              </NavLink>
              <NavLink to="/catalogo" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
                Catálogo
              </NavLink>
              <NavLink to="/secuencias-ncf" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
                NCF
              </NavLink>
              <NavLink to="/certificacion" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
                Certificación
              </NavLink>
              <NavLink to="/configuracion" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
                Configuración
              </NavLink>
              <NavLink to="/usuarios" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
                Usuarios
              </NavLink>
              {permiteApi && (
                <NavLink to="/api-keys" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
                  API Keys
                </NavLink>
              )}
              <button className="nav-link logout-btn" onClick={handleLogout}>
                Cerrar Sesión
              </button>
            </>
          ) : (
            <>
              <NavLink to="/planes" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
                Planes
              </NavLink>
              <NavLink to="/documentacion" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
                Documentación
              </NavLink>
              <NavLink to="/login" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
                Iniciar Sesión
              </NavLink>
              <NavLink to="/registro" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
                Registro
              </NavLink>
            </>
          )}
        </nav>
      </header>
      {certAlert && (
        <div style={{
          padding: '0.5rem 1.5rem',
          fontSize: '0.85rem',
          fontWeight: 500,
          textAlign: 'center',
          backgroundColor: certAlert.estado === 'vencido' ? '#fce8e6' : certAlert.estado === 'sin_certificado' ? '#fff3e0' : '#fef7e0',
          color: certAlert.estado === 'vencido' ? '#d93025' : '#e37400',
          borderBottom: '1px solid',
          borderColor: certAlert.estado === 'vencido' ? '#f5c6cb' : '#fdd663',
        }}>
          {certAlert.estado === 'vencido' && '⛔ Su certificado digital ha vencido. No podrá firmar facturas hasta renovarlo.'}
          {certAlert.estado === 'por_vencer' && `⚠️ Su certificado digital vence en ${certAlert.dias_restantes} día${certAlert.dias_restantes !== 1 ? 's' : ''} (${new Date(certAlert.vence_en!).toLocaleDateString('es-DO')}). Renuévelo pronto.`}
          {certAlert.estado === 'sin_certificado' && '⚠️ No tiene certificado digital cargado. Cargue su certificado .p12 en Configuración para poder facturar.'}
        </div>
      )}
      <main className="layout-content">
        <Outlet />
      </main>
    </div>
  );
}

export default Layout;
