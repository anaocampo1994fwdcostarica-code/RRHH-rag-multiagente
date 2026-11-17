import MainLayout from './components/layout/MainLayout.jsx'
import DashboardPage from './pages/DashboardPage.jsx'

function App() {
  return (
    <MainLayout
      title="Dashboard"
      subtitle="Vista general del portal interno de Recursos Humanos"
    >
      <DashboardPage />
    </MainLayout>
  )
}

export default App
