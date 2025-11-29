import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { X } from 'lucide-react';
import { getBusinesses } from '../../api/business.api';
import { copyClientToBusiness, Client } from '../../api/clients.api';

interface CopyClientDialogProps {
    client: Client;
    onClose: () => void;
    onSuccess: () => void;
}

export const CopyClientDialog: React.FC<CopyClientDialogProps> = ({ client, onClose, onSuccess }) => {
    const [targetBusinessId, setTargetBusinessId] = useState('');
    const queryClient = useQueryClient();

    // Obtener lista de negocios
    const { data: businesses, isLoading } = useQuery({
        queryKey: ['businesses'],
        queryFn: () => getBusinesses(),
    });

    // Mutation para copiar cliente
    const copyMutation = useMutation({
        mutationFn: () => copyClientToBusiness(client.id, targetBusinessId),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['clients'] });
            onSuccess();
            onClose();
        },
    });

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!targetBusinessId) {
            alert('Por favor selecciona un negocio destino');
            return;
        }
        copyMutation.mutate();
    };

    // Filtrar negocios (excluir el actual)
    const availableBusinesses = businesses?.filter(b => b.id !== client.businessId) || [];

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-md mx-4">
                {/* Header */}
                <div className="flex items-center justify-between p-6 border-b border-gray-200">
                    <h2 className="text-xl font-bold text-gray-900">
                        Copiar Cliente a Otro Negocio
                    </h2>
                    <button
                        onClick={onClose}
                        className="text-gray-400 hover:text-gray-600 transition-colors"
                    >
                        <X className="w-6 h-6" />
                    </button>
                </div>

                {/* Content */}
                <form onSubmit={handleSubmit} className="p-6 space-y-6">
                    {/* Cliente Info */}
                    <div className="bg-blue-50 rounded-lg p-4 border border-blue-200">
                        <p className="text-sm text-blue-600 font-semibold mb-1">Cliente a copiar:</p>
                        <p className="text-lg font-bold text-blue-900">{client.fullName}</p>
                        <p className="text-sm text-blue-700">Teléfono: {client.phone}</p>
                    </div>

                    {/* Business Selector */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                            Negocio Destino
                        </label>
                        <select
                            value={targetBusinessId}
                            onChange={(e) => setTargetBusinessId(e.target.value)}
                            className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                            disabled={isLoading}
                            required
                        >
                            <option value="">Selecciona un negocio...</option>
                            {isLoading && <option>Cargando negocios...</option>}
                            {availableBusinesses.map((business) => (
                                <option key={business.id} value={business.id}>
                                    {business.name}
                                </option>
                            ))}
                        </select>
                        {availableBusinesses.length === 0 && !isLoading && (
                            <p className="text-sm text-amber-600 mt-2">
                                No hay otros negocios disponibles
                            </p>
                        )}
                    </div>

                    {/* Info Message */}
                    <div className="bg-amber-50 rounded-lg p-4 border border-amber-200">
                        <p className="text-sm text-amber-800">
                            <span className="font-semibold">Nota:</span> Se creará una copia del cliente en el negocio seleccionado.
                            El cliente original permanecerá en su negocio actual. Los créditos y referencias NO se copian.
                        </p>
                    </div>

                    {/* Error Display */}
                    {copyMutation.isError && (
                        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                            <p className="text-sm text-red-800">
                                {copyMutation.error instanceof Error
                                    ? copyMutation.error.message
                                    : 'Error al copiar cliente'}
                            </p>
                        </div>
                    )}

                    {/* Actions */}
                    <div className="flex gap-3 pt-4">
                        <button
                            type="button"
                            onClick={onClose}
                            className="flex-1 px-4 py-2.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors font-medium"
                        >
                            Cancelar
                        </button>
                        <button
                            type="submit"
                            disabled={!targetBusinessId || copyMutation.isPending}
                            className="flex-1 px-4 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {copyMutation.isPending ? 'Copiando...' : 'Copiar Cliente'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};
