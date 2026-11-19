import { BrowserRouter, Outlet, Route, Routes, useLocation } from 'react-router'
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
import DashboardPage from './pages/DashboardPage.jsx'
import NotFoundPage from './pages/NotFoundPage.jsx'

const pageMetadata = {
  '/': { title: 'Dashboard', subtitle: 'Vista general del portal interno de Recursos Humanos' },
  '/politicas': { title: 'Políticas', subtitle: 'Catálogo de consulta de Recursos Humanos' },
  '/solicitudes': { title: 'Solicitudes', subtitle: 'Consulta y creación de borradores propios' },
  '/solicitudes/nueva': { title: 'Nueva solicitud', subtitle: 'Crea un borrador de permiso propio' },
  '/gestion-solicitudes': { title: 'Gestión de solicitudes', subtitle: 'Bandeja administrativa autorizada' },
  '/gestion-documentos': { title: 'Gestión de documentos', subtitle: 'Catálogo documental administrativo autorizado' },
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

function App() {
  return <AuthProvider><BrowserRouter><Routes><Route path="ingresar" element={<PublicOnlyRoute><LoginPage /></PublicOnlyRoute>} /><Route element={<AppLayout />}><Route index element={<DashboardPage />} /><Route path="chat" element={<ChatPage />} /><Route path="politicas" element={<PoliciesPage />} /><Route path="politicas/:id" element={<PolicyDetailPage />} /><Route path="empleados" element={<EmployeesPage />} /><Route path="empleados/:id" element={<EmployeeDetailPage />} /><Route path="solicitudes" element={<LeaveRequestsPage />} /><Route path="solicitudes/nueva" element={<NewLeaveRequestPage />} /><Route path="solicitudes/:id" element={<LeaveRequestDetailPage />} /><Route path="gestion-solicitudes" element={<AdminLeaveRequestsPage />} /><Route path="gestion-solicitudes/:id" element={<AdminLeaveRequestDetailPage />} /><Route path="gestion-documentos" element={<DocumentsPage />} /><Route path="*" element={<NotFoundPage />} /></Route></Routes></BrowserRouter></AuthProvider>
}

export default App
