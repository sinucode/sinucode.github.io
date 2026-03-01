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
    X,
} from 'lucide-react';

interface SidebarProps {
    isOpen: boolean;
    onClose: () => void;
}

export default function Sidebar({ isOpen, onClose }: SidebarProps) {
    const { user, logout } = useAuthStore();
    const { selectedBusinessName } = useBusinessStore();
    const navigate = useNavigate();

    const handleLogout = async () => {
        logout();
        navigate('/login');
    };

    const navLinks = [
        { to: '/dashboard', icon: <LayoutDashboard size={20} />, label: 'Dashboard', show: true },
        { to: '/businesses', icon: <Building2 size={20} />, label: 'Negocios', show: user?.role === 'super_admin' || user?.role === 'admin' },
        { to: '/clients', icon: <Users size={20} />, label: 'Clientes', show: true },
        { to: '/credits', icon: <CreditCard size={20} />, label: 'Créditos', show: true },
        { to: '/payments', icon: <DollarSign size={20} />, label: 'Pagos', show: true },
        { to: '/cash', icon: <Wallet size={20} />, label: 'Caja', show: true },
        { to: '/settings', icon: <Settings size={20} />, label: 'Configuración', show: true },
    ].filter(l => l.show);

    return (
        <>
            {/* Overlay para móvil */}
            {isOpen && (
                <div
                    className="fixed inset-0 bg-black/50 z-30 lg:hidden"
                    onClick={onClose}
                />
            )}

            {/* Sidebar */}
            <div className={`
                fixed top-0 left-0 h-full w-64 bg-primary-950 text-white flex flex-col z-40
                border-r border-primary-900/50 shadow-2xl
                transition-transform duration-300 ease-in-out
                ${isOpen ? 'translate-x-0' : '-translate-x-full'}
                lg:translate-x-0 lg:static lg:z-auto lg:shadow-xl
            `}>
                {/* Logo + Close button (móvil) */}
                <div className="p-5 border-b border-primary-900/50 flex items-center justify-between">
                    <div className="min-w-0">
                        <h1 className="text-lg font-bold bg-clip-text text-transparent bg-gradient-to-r from-primary-200 to-white truncate">
                            Gestióncredifacil
                        </h1>
                        <p className="text-xs text-primary-300 mt-0.5 truncate max-w-[180px]" title={user?.fullName || 'Usuario'}>
                            {user?.fullName || 'Usuario'}
                            {selectedBusinessName ? ` · ${selectedBusinessName}` : ''}
                        </p>
                    </div>
                    <button
                        onClick={onClose}
                        className="lg:hidden p-1.5 text-primary-300 hover:text-white hover:bg-primary-800 rounded-lg transition"
                    >
                        <X size={18} />
                    </button>
                </div>

                {/* Navigation */}
                <nav className="flex-1 p-3 space-y-0.5 overflow-y-auto">
                    {navLinks.map((link) => (
                        <SidebarLink
                            key={link.to}
                            to={link.to}
                            icon={link.icon}
                            label={link.label}
                            onClick={onClose}
                        />
                    ))}
                </nav>

                {/* User + Logout */}
                <div className="p-3 border-t border-primary-900/50">
                    <div className="flex items-center gap-3 mb-3 p-3 bg-primary-900/30 rounded-xl border border-primary-800/30">
                        <div className="w-9 h-9 rounded-full bg-gradient-to-br from-primary-500 to-primary-700 flex items-center justify-center font-bold text-white text-sm shadow-md shrink-0">
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
                        <LogOut size={16} />
                        Cerrar Sesión
                    </button>
                </div>
            </div>
        </>
    );
}

function SidebarLink({
    to,
    icon,
    label,
    onClick,
}: {
    to: string;
    icon: React.ReactNode;
    label: string;
    onClick: () => void;
}) {
    return (
        <NavLink
            to={to}
            onClick={onClick}
            className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200 ${isActive
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
