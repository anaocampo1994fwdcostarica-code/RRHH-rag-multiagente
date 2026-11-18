import { BrowserRouter, Outlet, Route, Routes, useLocation } from 'react-router'
import { AuthProvider } from './auth/AuthContext.jsx'
import LoginPage from './auth/LoginPage.jsx'
import { ProtectedRoute, PublicOnlyRoute } from './auth/ProtectedRoute.jsx'
import MainLayout from './components/layout/MainLayout.jsx'
import LeaveRequestDetailPage from './features/leaveRequests/pages/LeaveRequestDetailPage.jsx'
import LeaveRequestsPage from './features/leaveRequests/pages/LeaveRequestsPage.jsx'
import NewLeaveRequestPage from './features/leaveRequests/pages/NewLeaveRequestPage.jsx'
import PoliciesPage from './features/policies/pages/PoliciesPage.jsx'
import PolicyDetailPage from './features/policies/pages/PolicyDetailPage.jsx'
import DashboardPage from './pages/DashboardPage.jsx'
import NotFoundPage from './pages/NotFoundPage.jsx'

const pageMetadata = { '/': { title: 'Dashboard', subtitle: 'Vista general del portal interno de Recursos Humanos' }, '/politicas': { title: 'Políticas', subtitle: 'Catálogo de consulta de Recursos Humanos' }, '/solicitudes': { title: 'Solicitudes', subtitle: 'Consulta y creación de borradores propios' }, '/solicitudes/nueva': { title: 'Nueva solicitud', subtitle: 'Crea un borrador de permiso propio' } }

function AppLayout() {
  const { pathname } = useLocation()
  const metadata = pathname.startsWith('/politicas/') ? { title: 'Detalle de política', subtitle: 'Metadatos y resumen disponibles' } : pathname.startsWith('/solicitudes/') && pathname !== '/solicitudes/nueva' ? { title: 'Detalle de solicitud', subtitle: 'Consulta de una solicitud visible' } : pageMetadata[pathname] ?? { title: 'Página no encontrada', subtitle: 'La ruta solicitada no está disponible' }
  return <ProtectedRoute><MainLayout title={metadata.title} subtitle={metadata.subtitle}><Outlet /></MainLayout></ProtectedRoute>
}

function App() {
  return <AuthProvider><BrowserRouter><Routes><Route path="ingresar" element={<PublicOnlyRoute><LoginPage /></PublicOnlyRoute>} /><Route element={<AppLayout />}><Route index element={<DashboardPage />} /><Route path="politicas" element={<PoliciesPage />} /><Route path="politicas/:id" element={<PolicyDetailPage />} /><Route path="solicitudes" element={<LeaveRequestsPage />} /><Route path="solicitudes/nueva" element={<NewLeaveRequestPage />} /><Route path="solicitudes/:id" element={<LeaveRequestDetailPage />} /><Route path="*" element={<NotFoundPage />} /></Route></Routes></BrowserRouter></AuthProvider>
}

export default App
