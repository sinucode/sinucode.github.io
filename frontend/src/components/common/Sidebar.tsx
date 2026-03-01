import { NavLink, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../store/authStore';
import { useBusinessStore } from '../../store/businessStore';
import {
    LayoutDashboard,
    Users,
    CreditCard,
    DollarSign,
    Wallet,
    Settings,
    LogOut,
    Building2,
} from 'lucide-react';

export default function Sidebar() {
    const { user, logout } = useAuthStore();
    const { selectedBusinessName } = useBusinessStore();
    const navigate = useNavigate();

    const handleLogout = async () => {
        logout();
        navigate('/login');
    };

    return (
        <div className="w-64 bg-primary-950 text-white flex flex-col border-r border-primary-900/50 shadow-xl z-10">
            {/* Logo */}
            <div className="p-6 border-b border-primary-900/50">
                <h1 className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-primary-200 to-white">
                    Gestióncredifacil
                </h1>
                <p className="text-xs text-primary-300 mt-1 capitalize truncate max-w-[200px]" title={user?.fullName || 'Usuario'}>
                    {user?.fullName || 'Usuario'}
                    {selectedBusinessName ? ` • ${selectedBusinessName}` : ''}
                </p>
            </div>

            {/* Navigation */}
            <nav className="flex-1 p-4 space-y-2">
                <SidebarLink to="/dashboard" icon={<LayoutDashboard size={20} />} label="Dashboard" />

                {(user?.role === 'super_admin' || user?.role === 'admin') && (
                    <SidebarLink to="/businesses" icon={<Building2 size={20} />} label="Negocios" />
                )}

                <SidebarLink to="/clients" icon={<Users size={20} />} label="Clientes" />
                <SidebarLink to="/credits" icon={<CreditCard size={20} />} label="Créditos" />
                <SidebarLink to="/payments" icon={<DollarSign size={20} />} label="Pagos" />
                <SidebarLink to="/cash" icon={<Wallet size={20} />} label="Caja" />
                <SidebarLink to="/settings" icon={<Settings size={20} />} label="Configuración" />
            </nav>

            {/* User & Logout */}
            <div className="p-4 border-t border-primary-900/50">
                <div className="flex items-center gap-3 mb-4 p-3 bg-primary-900/30 rounded-xl border border-primary-800/30 shadow-inner">
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary-500 to-primary-700 flex items-center justify-center font-bold text-white shadow-md">
                        {user?.fullName?.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-primary-50 truncate">{user?.fullName}</p>
                        <p className="text-xs text-primary-300 truncate">{user?.email}</p>
                    </div>
                </div>
                <button
                    onClick={handleLogout}
                    className="w-full flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium text-danger-400 hover:text-white hover:bg-danger-500 rounded-lg transition-all duration-200"
                >
                    <LogOut size={18} />
                    Cerrar Sesión
                </button>
            </div>
        </div>
    );
}

function SidebarLink({ to, icon, label }: { to: string; icon: React.ReactNode; label: string }) {
    return (
        <NavLink
            to={to}
            className={({ isActive }) =>
                `flex items-center gap-3 px-4 py-2.5 rounded-lg transition-all duration-200 ${isActive
                    ? 'bg-primary-600 text-white shadow-md shadow-primary-600/20'
                    : 'text-primary-200 hover:bg-primary-800/50 hover:text-white'
                }`
            }
        >
            {icon}
            <span className="font-medium">{label}</span>
        </NavLink>
    );
}
