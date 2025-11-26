import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getAllUsers, toggleUserStatus, bulkToggleUserStatus, type User } from '../../api/users.api';
import { useAuthStore } from '../../store/authStore';
import UserForm from './UserForm';

export default function UserManagement() {
    const queryClient = useQueryClient();
    const currentUser = useAuthStore((state) => state.user);
    const [showCreateForm, setShowCreateForm] = useState(false);
    const [editingUser, setEditingUser] = useState<User | null>(null);
    const [selectedUserIds, setSelectedUserIds] = useState<Set<string>>(new Set());

    const { data: users, isLoading } = useQuery({
        queryKey: ['users'],
        queryFn: getAllUsers,
    });

    const toggleStatusMutation = useMutation({
        mutationFn: toggleUserStatus,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['users'] });
        },
        onError: (error: any) => {
            console.error('Error toggling user status:', error);
            alert(error.response?.data?.error || 'Error al cambiar el estado del usuario');
        },
    });

    const bulkToggleMutation = useMutation({
        mutationFn: ({ userIds, activate }: { userIds: string[]; activate: boolean }) =>
            bulkToggleUserStatus(userIds, activate),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['users'] });
            setSelectedUserIds(new Set());
        },
    });

    const getRoleBadgeClass = (role: string) => {
        switch (role) {
            case 'super_admin':
                return 'bg-purple-100 text-purple-800';
            case 'admin':
                return 'bg-blue-100 text-blue-800';
            case 'user':
                return 'bg-gray-100 text-gray-800';
            default:
                return 'bg-gray-100 text-gray-800';
        }
    };

    const getRoleLabel = (role: string) => {
        switch (role) {
            case 'super_admin':
                return 'Super Admin';
            case 'admin':
                return 'Administrador';
            case 'user':
                return 'Usuario';
            default:
                return role;
        }
    };

    const canManageUser = (targetRole: string) => {
        if (currentUser?.role === 'super_admin') return true;
        if (currentUser?.role === 'admin' && targetRole === 'user') return true;
        return false;
    };

    const canCreateUsers = currentUser?.role === 'super_admin' || currentUser?.role === 'admin';

    // Filtrar usuarios para admin (solo ver users)
    const filteredUsers = users?.filter((user) => {
        if (currentUser?.role === 'super_admin') return true;
        if (currentUser?.role === 'admin') return user.role === 'user';
        return false;
    });

    // Funciones para manejo de selección múltiple
    const handleSelectAll = () => {
        if (selectedUserIds.size === filteredUsers?.length) {
            setSelectedUserIds(new Set());
        } else {
            const allIds = new Set(filteredUsers?.map((u: User) => u.userId) || []);
            setSelectedUserIds(allIds);
        }
    };

    const handleSelectUser = (userId: string) => {
        const newSelected = new Set(selectedUserIds);
        if (newSelected.has(userId)) {
            newSelected.delete(userId);
        } else {
            newSelected.add(userId);
        }
        setSelectedUserIds(newSelected);
    };

    const handleBulkAction = (activate: boolean) => {
        if (selectedUserIds.size === 0) return;
        bulkToggleMutation.mutate({
            userIds: Array.from(selectedUserIds),
            activate,
        });
    };

    const isAllSelected = filteredUsers && filteredUsers.length > 0 &&
        selectedUserIds.size === filteredUsers.length;

    if (isLoading) {
        return (
            <div className="flex justify-center items-center py-12">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
            </div>
        );
    }

    return (
        <div>
            <div className="flex justify-between items-center mb-6">
                <h2 className="text-xl font-semibold">Gestión de Usuarios</h2>
                {canCreateUsers && (
                    <button
                        onClick={() => setShowCreateForm(true)}
                        className="bg-primary-600 text-white px-4 py-2 rounded-md hover:bg-primary-700 flex items-center gap-2"
                    >
                        <svg
                            className="w-5 h-5"
                            fill="none"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth="2"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                        >
                            <path d="M12 4v16m8-8H4"></path>
                        </svg>
                        Crear Usuario
                    </button>
                )}
            </div>

            {/* Barra de acciones masivas */}
            {selectedUserIds.size > 0 && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4 flex items-center justify-between">
                    <span className="text-sm font-medium text-blue-900">
                        {selectedUserIds.size} usuario(s) seleccionado(s)
                    </span>
                    <div className="flex gap-2">
                        <button
                            onClick={() => handleBulkAction(true)}
                            disabled={bulkToggleMutation.isPending}
                            className="bg-green-600 text-white px-4 py-2 rounded-md hover:bg-green-700 disabled:opacity-50 text-sm"
                        >
                            Activar seleccionados
                        </button>
                        <button
                            onClick={() => handleBulkAction(false)}
                            disabled={bulkToggleMutation.isPending}
                            className="bg-red-600 text-white px-4 py-2 rounded-md hover:bg-red-700 disabled:opacity-50 text-sm"
                        >
                            Desactivar seleccionados
                        </button>
                        <button
                            onClick={() => setSelectedUserIds(new Set())}
                            className="bg-gray-500 text-white px-4 py-2 rounded-md hover:bg-gray-600 text-sm"
                        >
                            Cancelar
                        </button>
                    </div>
                </div>
            )}

            <div className="bg-white rounded-lg shadow overflow-hidden">
                <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                        <tr>
                            <th className="px-6 py-3 text-left">
                                <input
                                    type="checkbox"
                                    checked={isAllSelected}
                                    onChange={handleSelectAll}
                                    className="w-4 h-4 text-primary-600 border-gray-300 rounded focus:ring-primary-500"
                                />
                            </th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                Usuario
                            </th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                Email
                            </th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                Rol
                            </th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                Estado
                            </th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                Acciones
                            </th>
                        </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                        {filteredUsers?.map((user: User) => (
                            <tr key={user.userId} className={selectedUserIds.has(user.userId) ? 'bg-blue-50' : ''}>
                                <td className="px-6 py-4 whitespace-nowrap">
                                    <input
                                        type="checkbox"
                                        checked={selectedUserIds.has(user.userId)}
                                        onChange={() => handleSelectUser(user.userId)}
                                        className="w-4 h-4 text-primary-600 border-gray-300 rounded focus:ring-primary-500"
                                    />
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap">
                                    <div className="text-sm font-medium text-gray-900">
                                        {user.fullName}
                                    </div>
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap">
                                    <div className="text-sm text-gray-500">{user.email}</div>
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap">
                                    <span
                                        className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${getRoleBadgeClass(
                                            user.role
                                        )}`}
                                    >
                                        {getRoleLabel(user.role)}
                                    </span>
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap">
                                    <span
                                        className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${user.isActive
                                            ? 'bg-green-100 text-green-800'
                                            : 'bg-red-100 text-red-800'
                                            }`}
                                    >
                                        {user.isActive ? 'Activo' : 'Inactivo'}
                                    </span>
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm">
                                    {canManageUser(user.role) && (
                                        <div className="flex gap-2">
                                            <button
                                                onClick={() => setEditingUser(user)}
                                                className="text-blue-600 hover:text-blue-900"
                                            >
                                                Editar
                                            </button>
                                            {user.userId !== currentUser?.userId && (
                                                <button
                                                    onClick={() =>
                                                        toggleStatusMutation.mutate(user.userId)
                                                    }
                                                    disabled={toggleStatusMutation.isPending}
                                                    className="text-primary-600 hover:text-primary-900 disabled:opacity-50"
                                                >
                                                    {user.isActive ? 'Desactivar' : 'Activar'}
                                                </button>
                                            )}
                                        </div>
                                    )}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>

                {filteredUsers?.length === 0 && (
                    <div className="text-center py-12 text-gray-500">
                        No hay usuarios registrados
                    </div>
                )}
            </div>

            {(showCreateForm || editingUser) && (
                <UserForm
                    onClose={() => {
                        setShowCreateForm(false);
                        setEditingUser(null);
                    }}
                    onSuccess={() => {
                        queryClient.invalidateQueries({ queryKey: ['users'] });
                        setShowCreateForm(false);
                        setEditingUser(null);
                    }}
                    currentUserRole={currentUser?.role || 'user'}
                    initialData={editingUser || undefined}
                />
            )}
        </div>
    );
}
