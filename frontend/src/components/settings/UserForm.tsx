import { useState, useEffect } from 'react';
import { useMutation } from '@tanstack/react-query';
import { createUser, updateUser, type CreateUserData, type User } from '../../api/users.api';
import { useQuery } from '@tanstack/react-query';
import { getBusinesses } from '../../api/business.api';

interface UserFormProps {
    onClose: () => void;
    onSuccess: () => void;
    currentUserRole: 'super_admin' | 'admin' | 'user';
    initialData?: User;
}

export default function UserForm({ onClose, onSuccess, currentUserRole, initialData }: UserFormProps) {
    const [formData, setFormData] = useState<CreateUserData>({
        email: '',
        fullName: '',
        password: '',
        role: 'user',
        businessId: '',
    });
    const [confirmPassword, setConfirmPassword] = useState('');
    const [error, setError] = useState('');

    const { data: businesses } = useQuery({
        queryKey: ['businesses'],
        queryFn: getBusinesses,
        enabled: currentUserRole === 'super_admin' || currentUserRole === 'admin',
    });

    useEffect(() => {
        if (initialData) {
            setFormData({
                email: initialData.email,
                fullName: initialData.fullName,
                password: '', // Password is empty for updates unless changed
                role: initialData.role,
                businessId: (initialData as any).businessId || '',
            });
        }
    }, [initialData]);

    // Determinar roles disponibles según jerarquía
    const getAvailableRoles = () => {
        if (currentUserRole === 'super_admin') {
            return [
                { value: 'super_admin', label: 'Super Admin' },
                { value: 'admin', label: 'Administrador' },
                { value: 'user', label: 'Usuario' },
            ];
        } else if (currentUserRole === 'admin') {
            return [{ value: 'user', label: 'Usuario' }];
        }
        return [];
    };

    const createUserMutation = useMutation({
        mutationFn: createUser,
        onSuccess: () => {
            onSuccess();
            onClose();
        },
        onError: (error: any) => {
            setError(error.response?.data?.error || 'Error al crear usuario');
        },
    });

    const updateUserMutation = useMutation({
        mutationFn: (data: any) => {
            console.log('Updating user with ID:', initialData!.userId);
            console.log('Update data:', data);
            return updateUser(initialData!.userId, data);
        },
        onSuccess: () => {
            onSuccess();
            onClose();
        },
        onError: (error: any) => {
            console.error('Update user error:', error);
            console.error('Error response:', error.response);
            const errorMessage = error.response?.data?.error || error.response?.data?.errors?.[0]?.msg || 'Error al actualizar usuario';
            setError(errorMessage);
        },
    });

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        setError('');

        // Validaciones
        if (!formData.email || !formData.fullName) {
            setError('Email y Nombre son obligatorios');
            return;
        }

        if (!initialData && !formData.password) {
            setError('La contraseña es obligatoria para nuevos usuarios');
            return;
        }

        if (formData.password) {
            if (formData.password !== confirmPassword) {
                setError('Las contraseñas no coinciden');
                return;
            }

            if (formData.password.length < 8) {
                setError('La contraseña debe tener al menos 8 caracteres');
                return;
            }

            if (!/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])/.test(formData.password)) {
                setError(
                    'La contraseña debe contener mayúsculas, minúsculas, números y símbolos'
                );
                return;
            }
        }

        // Validar negocio si rol user
        if (formData.role === 'user' && !formData.businessId) {
            setError('Selecciona un negocio para el usuario');
            return;
        }

        if (initialData) {
            const updateData: any = {
                email: formData.email,
                fullName: formData.fullName,
                role: formData.role,
                businessId: formData.role === 'user' ? formData.businessId : undefined,
            };
            if (formData.password) {
                updateData.password = formData.password;
            }
            updateUserMutation.mutate(updateData);
        } else {
            createUserMutation.mutate(formData);
        }
    };

    const isPending = createUserMutation.isPending || updateUserMutation.isPending;

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
                <div className="flex justify-between items-center mb-4">
                    <h3 className="text-lg font-semibold">
                        {initialData ? 'Editar Usuario' : 'Crear Usuario'}
                    </h3>
                    <button
                        onClick={onClose}
                        className="text-gray-400 hover:text-gray-600"
                    >
                        <svg
                            className="w-6 h-6"
                            fill="none"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth="2"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                        >
                            <path d="M6 18L18 6M6 6l12 12"></path>
                        </svg>
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="space-y-4">
                    {error && (
                        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded text-sm">
                            {error}
                        </div>
                    )}

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                            Nombre Completo
                        </label>
                        <input
                            type="text"
                            value={formData.fullName}
                            onChange={(e) =>
                                setFormData({ ...formData, fullName: e.target.value })
                            }
                            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                            Email
                        </label>
                        <input
                            type="email"
                            value={formData.email}
                            onChange={(e) =>
                                setFormData({ ...formData, email: e.target.value })
                            }
                            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                            Rol
                        </label>
                        <select
                            value={formData.role}
                            onChange={(e) =>
                                setFormData({
                                    ...formData,
                                    role: e.target.value as any,
                                })
                            }
                            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
                        >
                            {getAvailableRoles().map((role) => (
                                <option key={role.value} value={role.value}>
                                    {role.label}
                                </option>
                            ))}
                        </select>
                    </div>

                    {formData.role === 'user' && (currentUserRole === 'super_admin' || currentUserRole === 'admin') && (
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                Negocio
                            </label>
                            <select
                                value={formData.businessId}
                                onChange={(e) => setFormData({ ...formData, businessId: e.target.value })}
                                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
                            >
                                <option value="">Seleccione negocio</option>
                                {businesses?.map((b) => (
                                    <option key={b.id} value={b.id}>{b.name}</option>
                                ))}
                            </select>
                        </div>
                    )}

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                            Contraseña {initialData && '(Opcional)'}
                        </label>
                        <input
                            type="password"
                            value={formData.password}
                            onChange={(e) =>
                                setFormData({ ...formData, password: e.target.value })
                            }
                            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
                            placeholder={initialData ? 'Dejar en blanco para mantener actual' : ''}
                        />
                        <p className="text-xs text-gray-500 mt-1">
                            Mínimo 8 caracteres, incluir mayúsculas, minúsculas, números y
                            símbolos
                        </p>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                            Confirmar Contraseña
                        </label>
                        <input
                            type="password"
                            value={confirmPassword}
                            onChange={(e) => setConfirmPassword(e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
                        />
                    </div>

                    <div className="flex gap-3 pt-4">
                        <button
                            type="button"
                            onClick={onClose}
                            className="flex-1 px-4 py-2 border border-gray-300 rounded-md hover:bg-gray-50"
                        >
                            Cancelar
                        </button>
                        <button
                            type="submit"
                            disabled={isPending}
                            className="flex-1 bg-primary-600 text-white px-4 py-2 rounded-md hover:bg-primary-700 disabled:opacity-50"
                        >
                            {isPending ? 'Guardando...' : (initialData ? 'Guardar Cambios' : 'Crear Usuario')}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
