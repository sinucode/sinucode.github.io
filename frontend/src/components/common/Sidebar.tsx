import { NavLink, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../store/authStore';
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
    const navigate = useNavigate();

    const handleLogout = async () => {
        logout();
        navigate('/login');
    };

    return (
        <div className="w-64 bg-gray-900 text-white flex flex-col">
            {/* Logo */}
            <div className="p-6 border-b border-gray-800">
                <h1 className="text-xl font-bold">Gestióncredifacil</h1>
                <p className="text-xs text-gray-400 mt-1">{user?.role === 'super_admin' ? 'Administrador' : 'Usuario'}</p>
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
            <div className="p-4 border-t border-gray-800">
                <div className="flex items-center gap-3 mb-4 p-2 bg-gray-800 rounded-lg">
                    <div className="w-10 h-10 rounded-full bg-primary-600 flex items-center justify-center font-bold">
                        {user?.fullName?.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{user?.fullName}</p>
                        <p className="text-xs text-gray-400 truncate">{user?.email}</p>
                    </div>
                </div>
                <button
                    onClick={handleLogout}
                    className="w-full flex items-center gap-2 px-4 py-2 text-sm text-gray-300 hover:bg-gray-800 rounded-lg transition"
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
                `flex items-center gap-3 px-4 py-2.5 rounded-lg transition ${isActive
                    ? 'bg-primary-600 text-white'
                    : 'text-gray-300 hover:bg-gray-800'
                }`
            }
        >
            {icon}
            <span>{label}</span>
        </NavLink>
    );
}
