import { BrowserRouter, Outlet, Route, Routes, useLocation } from 'react-router'
import MainLayout from './components/layout/MainLayout.jsx'
import PoliciesPage from './features/policies/pages/PoliciesPage.jsx'
import PolicyDetailPage from './features/policies/pages/PolicyDetailPage.jsx'
import DashboardPage from './pages/DashboardPage.jsx'
import NotFoundPage from './pages/NotFoundPage.jsx'

const pageMetadata = {
  '/': { title: 'Dashboard', subtitle: 'Vista general del portal interno de Recursos Humanos' },
  '/politicas': { title: 'Políticas', subtitle: 'Catálogo de consulta de Recursos Humanos' },
}

function AppLayout() {
  const { pathname } = useLocation()
  const metadata = pathname.startsWith('/politicas/')
    ? { title: 'Detalle de política', subtitle: 'Consulta de documento de demostración' }
    : pageMetadata[pathname] ?? { title: 'Página no encontrada', subtitle: 'La ruta solicitada no está disponible' }

  return <MainLayout title={metadata.title} subtitle={metadata.subtitle}><Outlet /></MainLayout>
}

function App() {
  return <BrowserRouter><Routes><Route element={<AppLayout />}><Route index element={<DashboardPage />} /><Route path="politicas" element={<PoliciesPage />} /><Route path="politicas/:id" element={<PolicyDetailPage />} /><Route path="*" element={<NotFoundPage />} /></Route></Routes></BrowserRouter>
}

export default App
