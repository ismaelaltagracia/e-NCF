import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import './Layout.css';

function Layout() {
  const { isAuthenticated, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  return (
    <div className="layout">
      <header className="layout-header">
        <h1 className="layout-title">e-NCF</h1>
        <nav className="layout-nav" aria-label="Navegación principal">
          {isAuthenticated ? (
            <>
              <NavLink to="/facturas" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
                Facturas
              </NavLink>
              <NavLink to="/catalogo" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
                Catálogo
              </NavLink>
              <button className="nav-link logout-btn" onClick={handleLogout}>
                Cerrar Sesión
              </button>
            </>
          ) : (
            <>
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
