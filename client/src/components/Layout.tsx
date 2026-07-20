import { useState, useEffect } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import './Layout.css';

function Layout() {
  const { isAuthenticated, userRole, logout } = useAuth();
  const navigate = useNavigate();
  const [permiteApi, setPermiteApi] = useState(false);

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
      <main className="layout-content">
        <Outlet />
      </main>
    </div>
  );
}

export default Layout;
