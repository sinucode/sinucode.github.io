import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { changePassword } from '../../api/auth';

export default function ChangePasswordForm() {
    const [currentPassword, setCurrentPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');

    const changePasswordMutation = useMutation({
        mutationFn: changePassword,
        onSuccess: () => {
            setSuccess('Contraseña actualizada exitosamente');
            setCurrentPassword('');
            setNewPassword('');
            setConfirmPassword('');
            setError('');
        },
        onError: (error: any) => {
            setError(error.response?.data?.error || 'Error al cambiar la contraseña');
            setSuccess('');
        },
    });

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setSuccess('');

        // Validaciones
        if (!currentPassword || !newPassword || !confirmPassword) {
            setError('Todos los campos son obligatorios');
            return;
        }

        if (newPassword !== confirmPassword) {
            setError('Las contraseñas no coinciden');
            return;
        }

        if (newPassword.length < 8) {
            setError('La nueva contraseña debe tener al menos 8 caracteres');
            return;
        }

        if (!/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])/.test(newPassword)) {
            setError(
                'La contraseña debe contener mayúsculas, minúsculas, números y símbolos'
            );
            return;
        }

        changePasswordMutation.mutate({
            currentPassword,
            newPassword,
        });
    };

    return (
        <div className="max-w-2xl">
            <h2 className="text-xl font-semibold mb-4">Cambiar Contraseña</h2>

            <form onSubmit={handleSubmit} className="space-y-4">
                {error && (
                    <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
                        {error}
                    </div>
                )}

                {success && (
                    <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded">
                        {success}
                    </div>
                )}

                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                        Contraseña Actual
                    </label>
                    <input
                        type="password"
                        value={currentPassword}
                        onChange={(e) => setCurrentPassword(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
                    />
                </div>

                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                        Nueva Contraseña
                    </label>
                    <input
                        type="password"
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
                    />
                    <p className="text-xs text-gray-500 mt-1">
                        Mínimo 8 caracteres, debe incluir mayúsculas, minúsculas, números y
                        símbolos
                    </p>
                </div>

                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                        Confirmar Nueva Contraseña
                    </label>
                    <input
                        type="password"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
                    />
                </div>

                <button
                    type="submit"
                    disabled={changePasswordMutation.isPending}
                    className="bg-primary-600 text-white px-6 py-2 rounded-md hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    {changePasswordMutation.isPending
                        ? 'Guardando...'
                        : 'Cambiar Contraseña'}
                </button>
            </form>
        </div>
    );
}
