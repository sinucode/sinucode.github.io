import { useState } from 'react';
import { Outlet, NavLink, useLocation } from 'react-router-dom';
import Sidebar from '../components/common/Sidebar';
import {
    Menu,
    LayoutDashboard,
    Users,
    CreditCard,
    DollarSign,
    Wallet,
    Settings,
} from 'lucide-react';

const pageTitles: Record<string, string> = {
    '/dashboard': 'Dashboard',
    '/businesses': 'Negocios',
    '/clients': 'Clientes',
    '/credits': 'Créditos',
    '/payments': 'Pagos',
    '/cash': 'Caja',
    '/settings': 'Configuración',
};

const bottomNavItems = [
    { to: '/dashboard', icon: <LayoutDashboard size={22} />, label: 'Inicio' },
    { to: '/clients', icon: <Users size={22} />, label: 'Clientes' },
    { to: '/credits', icon: <CreditCard size={22} />, label: 'Créditos' },
    { to: '/payments', icon: <DollarSign size={22} />, label: 'Pagos' },
    { to: '/cash', icon: <Wallet size={22} />, label: 'Caja' },
    { to: '/settings', icon: <Settings size={22} />, label: 'Config' },
];

export default function DashboardLayout() {
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const location = useLocation();

    // Determine page title from current route
    const currentTitle = Object.entries(pageTitles).find(([path]) =>
        location.pathname === path || location.pathname.startsWith(path + '/')
    )?.[1] ?? 'Dashboard';

    return (
        <div className="flex h-screen bg-primary-50 overflow-hidden">
            {/* Sidebar (desktop: always visible, mobile: drawer) */}
            <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

            {/* Main area */}
            <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
                {/* Top Header */}
                <header className="bg-white border-b border-gray-200 shadow-sm z-20 shrink-0">
                    <div className="flex items-center gap-3 px-4 h-14">
                        {/* Hamburger (mobile only) */}
                        <button
                            onClick={() => setSidebarOpen(true)}
                            className="lg:hidden p-2 text-gray-600 hover:text-primary-700 hover:bg-primary-50 rounded-lg transition"
                            aria-label="Abrir menú"
                        >
                            <Menu size={22} />
                        </button>

                        {/* Page title */}
                        <h1 className="text-lg font-bold text-gray-900 truncate flex-1">{currentTitle}</h1>

                        {/* Logo small (mobile) */}
                        <span className="lg:hidden text-xs font-semibold text-primary-600 bg-primary-50 px-2 py-1 rounded-full border border-primary-200 hidden xs:block">
                            GCF
                        </span>
                    </div>
                </header>

                {/* Page content - scrollable */}
                <main className="flex-1 overflow-y-auto pb-20 lg:pb-6 p-4 lg:p-6">
                    <Outlet />
                </main>
            </div>

            {/* Bottom Navigation (mobile only) */}
            <nav className="fixed bottom-0 left-0 right-0 z-30 bg-white border-t border-gray-200 shadow-lg lg:hidden">
                <div className="flex items-stretch">
                    {bottomNavItems.map((item) => (
                        <NavLink
                            key={item.to}
                            to={item.to}
                            className={({ isActive }) =>
                                `flex-1 flex flex-col items-center justify-center py-2 gap-0.5 text-center transition-colors min-w-0
                                ${isActive
                                    ? 'text-primary-600 border-t-2 border-primary-600 bg-primary-50/70'
                                    : 'text-gray-500 border-t-2 border-transparent hover:text-primary-500'
                                }`
                            }
                        >
                            {item.icon}
                            <span className="text-[10px] font-medium truncate w-full text-center px-0.5 leading-tight">
                                {item.label}
                            </span>
                        </NavLink>
                    ))}
                </div>
            </nav>
        </div>
    );
}
