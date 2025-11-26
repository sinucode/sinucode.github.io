import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { X } from 'lucide-react';
import {
    createBusiness,
    updateBusiness,
    type Business,
    type CreateBusinessData,
} from '../../api/business.api';

interface BusinessFormProps {
    onClose: () => void;
    onSuccess: () => void;
    initialData?: Business;
}

export default function BusinessForm({ onClose, onSuccess, initialData }: BusinessFormProps) {
    const [formData, setFormData] = useState<CreateBusinessData>({
        name: initialData?.name || '',
        description: initialData?.description || '',
        initialCapital: initialData?.initialCapital || 0,
    });
    const [error, setError] = useState<string | null>(null);

    const createMutation = useMutation({
        mutationFn: createBusiness,
        onSuccess: () => {
            onSuccess();
        },
        onError: (err: any) => {
            setError(err.response?.data?.error || 'Error al crear el negocio');
        },
    });

    const updateMutation = useMutation({
        mutationFn: ({ id, data }: { id: string; data: CreateBusinessData }) =>
            updateBusiness(id, data),
        onSuccess: () => {
            onSuccess();
        },
        onError: (err: any) => {
            setError(err.response?.data?.error || 'Error al actualizar el negocio');
        },
    });

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);

        if (initialData) {
            updateMutation.mutate({ id: initialData.id, data: formData });
        } else {
            createMutation.mutate(formData);
        }
    };

    const isLoading = createMutation.isPending || updateMutation.isPending;

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4">
                {/* Header */}
                <div className="flex items-center justify-between p-6 border-b">
                    <h2 className="text-xl font-semibold">
                        {initialData ? 'Editar Negocio' : 'Crear Nuevo Negocio'}
                    </h2>
                    <button
                        onClick={onClose}
                        className="text-gray-400 hover:text-gray-600 transition-colors"
                    >
                        <X className="w-6 h-6" />
                    </button>
                </div>

                {/* Form */}
                <form onSubmit={handleSubmit} className="p-6">
                    {error && (
                        <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-md text-sm">
                            {error}
                        </div>
                    )}

                    <div className="space-y-4">
                        {/* Name */}
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                Nombre del Negocio *
                            </label>
                            <input
                                type="text"
                                required
                                minLength={3}
                                value={formData.name}
                                onChange={(e) =>
                                    setFormData({ ...formData, name: e.target.value })
                                }
                                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
                                placeholder="Ej: Tienda Principal"
                            />
                        </div>

                        {/* Description */}
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                Descripción
                            </label>
                            <textarea
                                rows={3}
                                value={formData.description}
                                onChange={(e) =>
                                    setFormData({ ...formData, description: e.target.value })
                                }
                                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
                                placeholder="Descripción opcional del negocio"
                            />
                        </div>

                        {/* Initial Capital */}
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                Capital Inicial (COP) {initialData && '*'}
                            </label>
                            <input
                                type="text"
                                value={formData.initialCapital.toLocaleString('es-CO')}
                                onChange={(e) => {
                                    // Remove dots and convert to number
                                    const numericValue = e.target.value.replace(/\./g, '');
                                    const parsed = parseInt(numericValue) || 0;
                                    setFormData({
                                        ...formData,
                                        initialCapital: parsed,
                                    });
                                }}
                                disabled={!!initialData}
                                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
                                placeholder="0"
                            />
                            {!initialData ? (
                                <p className="mt-1 text-xs text-gray-500">
                                    El balance actual iniciará con este valor. El capital inicial no se podrá cambiar después.
                                </p>
                            ) : (
                                <p className="mt-1 text-xs text-blue-600">
                                    💡 El capital inicial es inmutable (histórico), pero puedes inyectar capital adicional en cualquier momento mediante movimientos de caja.
                                </p>
                            )}
                        </div>
                    </div>

                    {/* Actions */}
                    <div className="flex gap-3 mt-6">
                        <button
                            type="button"
                            onClick={onClose}
                            disabled={isLoading}
                            className="flex-1 px-4 py-2 border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50"
                        >
                            Cancelar
                        </button>
                        <button
                            type="submit"
                            disabled={isLoading}
                            className="flex-1 px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700 disabled:opacity-50"
                        >
                            {isLoading
                                ? 'Guardando...'
                                : initialData
                                    ? 'Actualizar'
                                    : 'Crear'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
