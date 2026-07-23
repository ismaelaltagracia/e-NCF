import { Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout';
import Login from './pages/Login';
import Onboarding from './pages/Onboarding';
import Planes from './pages/Planes';
import Configuracion from './pages/Configuracion';
import Facturas from './pages/Facturas';
import FacturasLista from './pages/FacturasLista';
import FacturasBatch from './pages/FacturasBatch';
import Reportes from './pages/Reportes';
import Catalogo from './pages/Catalogo';
import SecuenciasNcf from './pages/SecuenciasNcf';
import FacturasRecibidas from './pages/FacturasRecibidas';
import Certificacion from './pages/Certificacion';
import Usuarios from './pages/Usuarios';
import ApiKeys from './pages/ApiKeys';
import Documentacion from './pages/Documentacion';
import MiPlan from './pages/MiPlan';
import Dashboard from './pages/Dashboard';
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
  const { isAuthenticated } = useAuth();

  return (
    <Routes>
      <Route path="/" element={<Layout />}>
        <Route index element={<Navigate to={isAuthenticated ? '/dashboard' : '/login'} replace />} />
        <Route path="login" element={<Login />} />
        <Route path="planes" element={<Planes />} />
        <Route path="documentacion" element={<Documentacion />} />
        <Route path="registro" element={<Onboarding />} />
        <Route
          path="dashboard"
          element={
            <ProtectedRoute>
              <Dashboard />
            </ProtectedRoute>
          }
        />
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
          path="facturas/batch"
          element={
            <ProtectedRoute>
              <FacturasBatch />
            </ProtectedRoute>
          }
        />
        <Route
          path="reportes"
          element={
            <ProtectedRoute>
              <Reportes />
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
          path="mi-plan"
          element={
            <ProtectedRoute>
              <MiPlan />
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
        <Route path="*" element={<Navigate to={isAuthenticated ? '/dashboard' : '/login'} replace />} />
      </Route>
    </Routes>
  );
}

export default App;
