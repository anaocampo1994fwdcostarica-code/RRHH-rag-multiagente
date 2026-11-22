import { BrowserRouter, Navigate, Outlet, Route, Routes, useLocation } from 'react-router'
import { AuthProvider } from './auth/AuthContext.jsx'
import ChatPage from './features/chat/ChatPage.jsx'
import LoginPage from './auth/LoginPage.jsx'
import { ProtectedRoute, PublicOnlyRoute } from './auth/ProtectedRoute.jsx'
import MainLayout from './components/layout/MainLayout.jsx'
import AdminLeaveRequestDetailPage from './features/leaveRequests/pages/AdminLeaveRequestDetailPage.jsx'
import EmployeeDetailPage from './features/employees/pages/EmployeeDetailPage.jsx'
import EmployeesPage from './features/employees/pages/EmployeesPage.jsx'
import AdminLeaveRequestsPage from './features/leaveRequests/pages/AdminLeaveRequestsPage.jsx'
import LeaveRequestDetailPage from './features/leaveRequests/pages/LeaveRequestDetailPage.jsx'
import LeaveRequestsPage from './features/leaveRequests/pages/LeaveRequestsPage.jsx'
import NewLeaveRequestPage from './features/leaveRequests/pages/NewLeaveRequestPage.jsx'
import PoliciesPage from './features/policies/pages/PoliciesPage.jsx'
import PolicyDetailPage from './features/policies/pages/PolicyDetailPage.jsx'
import DocumentsPage from './features/documents/DocumentsPage.jsx'
import ReportsPage from './features/reports/ReportsPage.jsx'
import { ErrorBlock, LoadingBlock } from './components/StatusBlocks.jsx'
import { usePermissionState } from './features/employees/usePermission.js'
import DashboardPage from './pages/DashboardPage.jsx'
import NotFoundPage from './pages/NotFoundPage.jsx'

const pageMetadata = {
  '/dashboard': { title: 'Dashboard', subtitle: 'Reporte diario de Recursos Humanos' },
  '/reportes': { title: 'Reportes', subtitle: 'Historial de reportes diarios' },
  '/chat': { title: 'Chat IA', subtitle: 'Consulta políticas y procesos de Recursos Humanos' },
  '/politicas': { title: 'Políticas', subtitle: 'Políticas vigentes publicadas desde Google Drive' },
  '/solicitudes': { title: 'Solicitudes', subtitle: 'Consulta y creación de borradores propios' },
  '/solicitudes/nueva': { title: 'Nueva solicitud', subtitle: 'Crea un borrador de permiso propio' },
  '/gestion-solicitudes': { title: 'Gestión de solicitudes', subtitle: 'Bandeja administrativa autorizada' },
  '/documentos': { title: 'Documentos', subtitle: 'Catálogo documental y sincronización con Drive' },
}

function AppLayout() {
  const { pathname } = useLocation()
  const metadata = pathname.startsWith('/politicas/')
    ? { title: 'Detalle de política', subtitle: 'Metadatos y resumen disponibles' }
    : pathname.startsWith('/gestion-solicitudes/')
      ? { title: 'Detalle administrativo', subtitle: 'Consulta autorizada de solicitud' }
      : pathname.startsWith('/solicitudes/') && pathname !== '/solicitudes/nueva'
        ? { title: 'Detalle de solicitud', subtitle: 'Consulta de una solicitud visible' }
        : pageMetadata[pathname] ?? { title: 'Página no encontrada', subtitle: 'La ruta solicitada no está disponible' }
  return <ProtectedRoute><MainLayout title={metadata.title} subtitle={metadata.subtitle}><Outlet /></MainLayout></ProtectedRoute>
}

function HomeRedirect() {
  const { allowed, loading, error, retry } = usePermissionState('reports.read')
  if (loading) return <LoadingBlock label="Cargando…" />
  if (error) return <ErrorBlock message="No fue posible verificar tus permisos." onRetry={retry} />
  return <Navigate to={allowed ? '/dashboard' : '/chat'} replace />
}

function App() {
  return <AuthProvider><BrowserRouter><Routes><Route path="ingresar" element={<PublicOnlyRoute><LoginPage /></PublicOnlyRoute>} /><Route element={<AppLayout />}><Route index element={<HomeRedirect />} /><Route path="dashboard" element={<DashboardPage />} /><Route path="reportes" element={<ReportsPage />} /><Route path="chat" element={<ChatPage />} /><Route path="politicas" element={<PoliciesPage />} /><Route path="politicas/:id" element={<PolicyDetailPage />} /><Route path="empleados" element={<EmployeesPage />} /><Route path="empleados/:id" element={<EmployeeDetailPage />} /><Route path="solicitudes" element={<LeaveRequestsPage />} /><Route path="solicitudes/nueva" element={<NewLeaveRequestPage />} /><Route path="solicitudes/:id" element={<LeaveRequestDetailPage />} /><Route path="gestion-solicitudes" element={<AdminLeaveRequestsPage />} /><Route path="gestion-solicitudes/:id" element={<AdminLeaveRequestDetailPage />} /><Route path="documentos" element={<DocumentsPage />} /><Route path="gestion-documentos" element={<Navigate to="/documentos" replace />} /><Route path="*" element={<NotFoundPage />} /></Route></Routes></BrowserRouter></AuthProvider>
}

export default App
