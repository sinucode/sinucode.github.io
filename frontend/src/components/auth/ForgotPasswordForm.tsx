import React, { useState } from 'react';
import { forgotPassword, resetPassword } from '../../api/auth';
import { Mail, KeyRound, Lock, ArrowLeft } from 'lucide-react';

interface ForgotPasswordFormProps {
    onBack: () => void;
}

type Step = 'REQUEST_CODE' | 'RESET_PASSWORD';

export default function ForgotPasswordForm({ onBack }: ForgotPasswordFormProps) {
    const [step, setStep] = useState<Step>('REQUEST_CODE');

    // Formulario Paso 1
    const [email, setEmail] = useState('');

    // Formulario Paso 2
    const [code, setCode] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');

    // Estado de la UI
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');

    const handleRequestCode = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setSuccess('');
        setIsLoading(true);

        try {
            await forgotPassword(email);
            setSuccess('Si el correo existe, hemos enviado un código de 6 dígitos.');
            setStep('RESET_PASSWORD');
        } catch (err: any) {
            setError(err.response?.data?.error || 'Error al solicitar el código');
        } finally {
            setIsLoading(false);
        }
    };

    const handleResetPassword = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setSuccess('');

        if (newPassword !== confirmPassword) {
            setError('Las contraseñas no coinciden');
            return;
        }

        if (code.length !== 6) {
            setError('El código debe tener exactamente 6 caracteres');
            return;
        }

        setIsLoading(true);

        try {
            await resetPassword(email, code, newPassword);
            setSuccess('Contraseña restablecida exitosamente. Ahora puedes iniciar sesión.');
            setTimeout(() => {
                onBack();
            }, 3000);
        } catch (err: any) {
            setError(err.response?.data?.error || 'Error al restablecer la contraseña');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="space-y-6 animate-fade-in">
            <div className="text-center">
                <button
                    onClick={onBack}
                    className="flex justify-center items-center gap-2 text-sm text-primary-600 hover:text-primary-700 transition mx-auto mb-4"
                >
                    <ArrowLeft className="h-4 w-4" />
                    Volver al login
                </button>
                <h2 className="text-2xl font-bold text-gray-900 mb-2">
                    {step === 'REQUEST_CODE' ? 'Recuperar Contraseña' : 'Nueva Contraseña'}
                </h2>
                <p className="text-gray-600 text-sm">
                    {step === 'REQUEST_CODE'
                        ? 'Ingresa tu correo para recibir un código de recuperación.'
                        : 'Ingresa el código que enviamos a tu correo y tu nueva contraseña.'}
                </p>
            </div>

            {error && (
                <div className="bg-danger-50 border border-danger-200 text-danger-700 px-4 py-3 rounded-lg text-sm">
                    {error}
                </div>
            )}

            {success && (
                <div className="bg-success-50 border border-success-200 text-success-700 px-4 py-3 rounded-lg text-sm">
                    {success}
                </div>
            )}

            {step === 'REQUEST_CODE' ? (
                <form onSubmit={handleRequestCode} className="space-y-4">
                    <div>
                        <label htmlFor="reset-email" className="block text-sm font-medium text-primary-900 mb-2">
                            Correo Electrónico
                        </label>
                        <div className="relative">
                            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                <Mail className="h-5 w-5 text-gray-400" />
                            </div>
                            <input
                                id="reset-email"
                                type="email"
                                required
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                className="block w-full pl-10 pr-3 py-2.5 border border-primary-200 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent transition"
                                placeholder="tu@email.com"
                            />
                        </div>
                    </div>

                    <button
                        type="submit"
                        disabled={isLoading}
                        className="w-full flex justify-center items-center gap-2 py-3 px-4 border border-transparent rounded-lg shadow-sm text-sm font-medium text-white bg-primary-500 hover:bg-primary-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 disabled:opacity-50 transition"
                    >
                        {isLoading ? 'Enviando...' : 'Enviar código'}
                    </button>
                </form>
            ) : (
                <form onSubmit={handleResetPassword} className="space-y-4">
                    <div>
                        <label htmlFor="code" className="block text-sm font-medium text-primary-900 mb-2">
                            Código de 6 dígitos
                        </label>
                        <div className="relative">
                            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                <KeyRound className="h-5 w-5 text-gray-400" />
                            </div>
                            <input
                                id="code"
                                type="text"
                                required
                                maxLength={6}
                                value={code}
                                onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                                className="block w-full pl-10 pr-3 py-2.5 border border-primary-200 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent transition text-center tracking-widest font-mono text-lg"
                                placeholder="123456"
                            />
                        </div>
                    </div>

                    <div>
                        <label htmlFor="new-password" className="block text-sm font-medium text-primary-900 mb-2">
                            Nueva Contraseña
                        </label>
                        <div className="relative">
                            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                <Lock className="h-5 w-5 text-gray-400" />
                            </div>
                            <input
                                id="new-password"
                                type="password"
                                required
                                minLength={8}
                                value={newPassword}
                                onChange={(e) => setNewPassword(e.target.value)}
                                className="block w-full pl-10 pr-3 py-2.5 border border-primary-200 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent transition"
                                placeholder="••••••••"
                            />
                        </div>
                    </div>

                    <div>
                        <label htmlFor="confirm-password" className="block text-sm font-medium text-primary-900 mb-2">
                            Confirmar Contraseña
                        </label>
                        <div className="relative">
                            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                <Lock className="h-5 w-5 text-gray-400" />
                            </div>
                            <input
                                id="confirm-password"
                                type="password"
                                required
                                minLength={8}
                                value={confirmPassword}
                                onChange={(e) => setConfirmPassword(e.target.value)}
                                className="block w-full pl-10 pr-3 py-2.5 border border-primary-200 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent transition"
                                placeholder="••••••••"
                            />
                        </div>
                    </div>

                    <p className="text-xs text-primary-600 mt-1">
                        La contraseña debe tener al menos 8 caracteres, una mayúscula, una minúscula y un número.
                    </p>

                    <button
                        type="submit"
                        disabled={isLoading}
                        className="w-full mt-4 flex justify-center items-center gap-2 py-3 px-4 border border-transparent rounded-lg shadow-sm text-sm font-medium text-white bg-primary-500 hover:bg-primary-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 disabled:opacity-50 transition"
                    >
                        {isLoading ? 'Restableciendo...' : 'Restablecer Contraseña'}
                    </button>
                </form>
            )}
        </div>
    );
}
