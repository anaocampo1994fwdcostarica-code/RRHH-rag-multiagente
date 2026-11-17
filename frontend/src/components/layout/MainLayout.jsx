import Header from './Header.jsx'
import Sidebar from './Sidebar.jsx'

function MainLayout({ children, title, subtitle }) {
  return (
    <div className="min-h-screen bg-slate-50 lg:flex">
      <Sidebar />
      <div className="min-w-0 flex-1">
        <Header title={title} subtitle={subtitle} />
        <main id="dashboard" className="px-5 py-7 sm:px-8 sm:py-9">{children}</main>
      </div>
    </div>
  )
}

export default MainLayout
