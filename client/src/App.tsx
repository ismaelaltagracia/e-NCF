import { Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout';
import Login from './pages/Login';
import Onboarding from './pages/Onboarding';
import Planes from './pages/Planes';
import Configuracion from './pages/Configuracion';
import Facturas from './pages/Facturas';
import FacturasLista from './pages/FacturasLista';
import Catalogo from './pages/Catalogo';
import SecuenciasNcf from './pages/SecuenciasNcf';
import FacturasRecibidas from './pages/FacturasRecibidas';
import Certificacion from './pages/Certificacion';
import Usuarios from './pages/Usuarios';
import ApiKeys from './pages/ApiKeys';
import AdminEmpresas from './pages/admin/AdminEmpresas';
import AdminPlanes from './pages/admin/AdminPlanes';
import AdminAuditoria from './pages/admin/AdminAuditoria';
import { useAuth } from './context/AuthContext';

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuth();
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }
  return <>{children}</>;
}

function App() {
  return (
    <Routes>
      <Route path="/" element={<Layout />}>
        <Route index element={<Navigate to="/login" replace />} />
        <Route path="login" element={<Login />} />
        <Route path="planes" element={<Planes />} />
        <Route path="registro" element={<Onboarding />} />
        <Route
          path="facturas"
          element={
            <ProtectedRoute>
              <FacturasLista />
            </ProtectedRoute>
          }
        />
        <Route
          path="facturas/nueva"
          element={
            <ProtectedRoute>
              <Facturas />
            </ProtectedRoute>
          }
        />
        <Route
          path="facturas-recibidas"
          element={
            <ProtectedRoute>
              <FacturasRecibidas />
            </ProtectedRoute>
          }
        />
        <Route
          path="catalogo"
          element={
            <ProtectedRoute>
              <Catalogo />
            </ProtectedRoute>
          }
        />
        <Route
          path="configuracion"
          element={
            <ProtectedRoute>
              <Configuracion />
            </ProtectedRoute>
          }
        />
        <Route
          path="secuencias-ncf"
          element={
            <ProtectedRoute>
              <SecuenciasNcf />
            </ProtectedRoute>
          }
        />
        <Route
          path="certificacion"
          element={
            <ProtectedRoute>
              <Certificacion />
            </ProtectedRoute>
          }
        />
        <Route
          path="usuarios"
          element={
            <ProtectedRoute>
              <Usuarios />
            </ProtectedRoute>
          }
        />
        <Route
          path="api-keys"
          element={
            <ProtectedRoute>
              <ApiKeys />
            </ProtectedRoute>
          }
        />
        {/* Super Admin routes */}
        <Route
          path="admin/empresas"
          element={
            <ProtectedRoute>
              <AdminEmpresas />
            </ProtectedRoute>
          }
        />
        <Route
          path="admin/planes"
          element={
            <ProtectedRoute>
              <AdminPlanes />
            </ProtectedRoute>
          }
        />
        <Route
          path="admin/auditoria"
          element={
            <ProtectedRoute>
              <AdminAuditoria />
            </ProtectedRoute>
          }
        />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Route>
    </Routes>
  );
}

export default App;
