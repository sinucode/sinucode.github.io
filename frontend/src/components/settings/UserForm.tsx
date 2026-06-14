import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
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
        enabled: currentUserRole === 'super_admin',
    });

    useEffect(() => {
        if (initialData) {
            setFormData({
                email: initialData.email,
                fullName: initialData.fullName,
                password: '',
                role: initialData.role,
                businessId: initialData.businessId || '',
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
        onError: (error: any) => {
            setError(error.response?.data?.error || 'Error al crear usuario');
        },
    });

    const updateUserMutation = useMutation({
        mutationFn: (data: any) => updateUser(initialData!.userId, data),
        onError: (error: any) => {
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

        // Validar negocio si rol user o admin
        if ((formData.role === 'user' || formData.role === 'admin') && !formData.businessId && !initialData && currentUserRole === 'super_admin') {
            setError('Selecciona un negocio para el usuario');
            return;
        }

        if (initialData) {
            const updateData: any = {
                email: formData.email,
                fullName: formData.fullName,
                role: formData.role,
                businessId: formData.businessId || '',
            };
            if (formData.password) updateData.password = formData.password;

            updateUserMutation.mutate(updateData, {
                onSuccess: () => { onSuccess(); onClose(); },
            });
            return;
        } else {
            createUserMutation.mutate(formData, {
                onSuccess: () => { onSuccess(); onClose(); },
            });
        }
    };

    const isPending = createUserMutation.isPending || updateUserMutation.isPending;

    return createPortal(
        /* Overlay */
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">

            {/* Modal: flex column con altura máxima del 90% de la pantalla */}
            <div className="bg-white rounded-xl w-full max-w-md flex flex-col max-h-[90vh] shadow-2xl">

                {/* ── Header fijo ── */}
                <div className="flex justify-between items-center px-6 py-4 border-b border-gray-100 flex-shrink-0">
                    <h3 className="text-lg font-semibold text-gray-900">
                        {initialData ? 'Editar Usuario' : 'Crear Usuario'}
                    </h3>
                    <button
                        onClick={onClose}
                        className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                    >
                        <svg className="w-5 h-5" fill="none" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24" stroke="currentColor">
                            <path d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                {/* ── Cuerpo scrollable ── */}
                <div className="flex-1 overflow-y-auto px-6 py-4">
                    <form id="user-form" onSubmit={handleSubmit} className="space-y-4">
                        {error && (
                            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
                                {error}
                            </div>
                        )}

                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Nombre Completo</label>
                            <input
                                type="text"
                                value={formData.fullName}
                                onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
                                className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                            <input
                                type="email"
                                value={formData.email}
                                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                                className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Rol</label>
                            <select
                                value={formData.role}
                                onChange={(e) => setFormData({ ...formData, role: e.target.value as any })}
                                className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 bg-white"
                            >
                                {getAvailableRoles().map((role) => (
                                    <option key={role.value} value={role.value}>{role.label}</option>
                                ))}
                            </select>
                        </div>

                        {(formData.role === 'user' || formData.role === 'admin') && currentUserRole === 'super_admin' && (
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Negocio Asignado</label>
                                <select
                                    value={formData.businessId}
                                    onChange={(e) => setFormData({ ...formData, businessId: e.target.value })}
                                    className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 bg-white"
                                >
                                    <option value="">Sin asignar</option>
                                    {businesses?.map((b) => (
                                        <option key={b.id} value={b.id}>{b.name}</option>
                                    ))}
                                </select>
                            </div>
                        )}

                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                Contraseña {initialData && <span className="font-normal text-gray-400">(opcional)</span>}
                            </label>
                            <input
                                type="password"
                                value={formData.password}
                                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                                className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                                placeholder={initialData ? 'Dejar en blanco para mantener la actual' : ''}
                            />
                            <p className="text-xs text-gray-400 mt-1">Mínimo 8 caracteres, mayúsculas, minúsculas, números y símbolos</p>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Confirmar Contraseña</label>
                            <input
                                type="password"
                                value={confirmPassword}
                                onChange={(e) => setConfirmPassword(e.target.value)}
                                className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                            />
                        </div>

                    </form>
                </div>

                {/* ── Footer fijo con botones ── */}
                <div className="flex gap-3 px-6 py-4 border-t border-gray-100 bg-gray-50/50 flex-shrink-0 rounded-b-xl">
                    <button
                        type="button"
                        onClick={onClose}
                        className="flex-1 px-4 py-2.5 border border-gray-200 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-100 transition-colors"
                    >
                        Cancelar
                    </button>
                    <button
                        type="submit"
                        form="user-form"
                        disabled={isPending}
                        className="flex-1 bg-primary-500 text-white px-4 py-2.5 rounded-lg text-sm font-semibold hover:bg-primary-600 disabled:opacity-50 transition-colors"
                    >
                        {isPending ? 'Guardando…' : (initialData ? 'Guardar cambios' : 'Crear usuario')}
                    </button>
                </div>
            </div>
        </div>,
        document.body
    );
}
