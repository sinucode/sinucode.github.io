import { useEffect, useState } from 'react';
import { useAuthStore } from '../store/authStore';
import ChangePasswordForm from '../components/settings/ChangePasswordForm';
import UserManagement from '../components/settings/UserManagement';
import AuditLogsViewer from '../components/settings/AuditLogsViewer';
import { useQuery } from '@tanstack/react-query';
import { getCurrentUser } from '../api/auth';

type Tab = 'profile' | 'users' | 'audit';

export default function SettingsPage() {
    const { user, setUser } = useAuthStore((state) => ({
        user: state.user,
        setUser: state.setUser,
    }));
    const [activeTab, setActiveTab] = useState<Tab>('profile');

    // Obtener perfil si no está en el store
    const { data: userData } = useQuery({
        queryKey: ['me'],
        queryFn: getCurrentUser,
        enabled: !user,
    });

    useEffect(() => {
        if (userData) {
            setUser(userData);
        }
    }, [userData, setUser]);

    const tabs = [
        {
            id: 'profile' as Tab,
            label: 'Mi Perfil',
            icon: (
                <svg
                    className="w-5 h-5"
                    fill="none"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                >
                    <path d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"></path>
                </svg>
            ),
            show: true,
        },
        {
            id: 'users' as Tab,
            label: 'Usuarios',
            icon: (
                <svg
                    className="w-5 h-5"
                    fill="none"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                >
                    <path d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"></path>
                </svg>
            ),
            show: user?.role === 'super_admin' || user?.role === 'admin',
        },
        {
            id: 'audit' as Tab,
            label: 'Auditoría',
            icon: (
                <svg
                    className="w-5 h-5"
                    fill="none"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                >
                    <path d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path>
                </svg>
            ),
            show: user?.role === 'super_admin',
        },
    ];

    const visibleTabs = tabs.filter((tab) => tab.show);

    return (
        <div className="container mx-auto px-4 py-8">
            <h1 className="text-2xl font-bold mb-6">Configuración</h1>

            {/* Tabs */}
            <div className="border-b border-gray-200 mb-6">
                <nav className="-mb-px flex space-x-8">
                    {visibleTabs.map((tab) => (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            className={`
                                group inline-flex items-center py-4 px-1 border-b-2 font-medium text-sm
                                ${activeTab === tab.id
                                    ? 'border-primary-500 text-primary-600'
                                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                                }
                            `}
                        >
                            <span
                                className={`mr-2 ${activeTab === tab.id
                                    ? 'text-primary-500'
                                    : 'text-gray-400 group-hover:text-gray-500'
                                    }`}
                            >
                                {tab.icon}
                            </span>
                            {tab.label}
                        </button>
                    ))}
                </nav>
            </div>

            {/* Content */}
            <div className="mt-6">
                {activeTab === 'profile' && (
                    <div className="space-y-8">
                        <div className="bg-white rounded-lg shadow p-6">
                            <h3 className="text-lg font-semibold mb-4">
                                Información del Usuario
                            </h3>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">
                                        Nombre Completo
                                    </label>
                                    <input
                                        type="text"
                                        value={user?.fullName || ''}
                                        disabled
                                        className="w-full px-3 py-2 border border-gray-300 rounded-md bg-gray-100"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">
                                        Email
                                    </label>
                                    <input
                                        type="email"
                                        value={user?.email || ''}
                                        disabled
                                        className="w-full px-3 py-2 border border-gray-300 rounded-md bg-gray-100"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">
                                        Rol
                                    </label>
                                    <input
                                        type="text"
                                        value={
                                            user?.role === 'super_admin'
                                                ? 'Super Administrador'
                                                : user?.role === 'admin'
                                                    ? 'Administrador'
                                                    : 'Usuario'
                                        }
                                        disabled
                                        className="w-full px-3 py-2 border border-gray-300 rounded-md bg-gray-100"
                                    />
                                </div>
                            </div>
                        </div>

                        <div className="bg-white rounded-lg shadow p-6">
                            <ChangePasswordForm />
                        </div>
                    </div>
                )}

                {activeTab === 'users' && <UserManagement />}

                {activeTab === 'audit' && <AuditLogsViewer />}
            </div>
        </div>
    );
}
