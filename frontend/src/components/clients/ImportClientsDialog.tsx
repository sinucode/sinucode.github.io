import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { X, CheckSquare, Square, AlertCircle, CheckCircle2 } from 'lucide-react';
import { getBusinesses } from '../../api/business.api';
import { getClients, batchImportClients, Client } from '../../api/clients.api';

interface ImportClientsDialogProps {
    currentBusinessId: string;
    onClose: () => void;
    onSuccess: () => void;
}

export const ImportClientsDialog: React.FC<ImportClientsDialogProps> = ({
    currentBusinessId,
    onClose,
    onSuccess,
}) => {
    const [sourceBusinessId, setSourceBusinessId] = useState('');
    const [selectedClientIds, setSelectedClientIds] = useState<Set<string>>(new Set());
    const queryClient = useQueryClient();

    // Obtener lista de negocios
    const { data: businesses, isLoading: loadingBusinesses } = useQuery({
        queryKey: ['businesses'],
        queryFn: () => getBusinesses(),
    });

    // Obtener clientes del negocio origen seleccionado
    const { data: sourceClients, isLoading: loadingClients } = useQuery({
        queryKey: ['source-clients', sourceBusinessId],
        queryFn: () => getClients(sourceBusinessId),
        enabled: !!sourceBusinessId,
    });

    // Mutation para importar clientes
    const importMutation = useMutation({
        mutationFn: () => batchImportClients(Array.from(selectedClientIds), currentBusinessId),
        onSuccess: (data) => {
            queryClient.invalidateQueries({ queryKey: ['clients'] });
            if (data.data.imported > 0) {
                onSuccess();
            }
        },
    });

    // Reset selected clients when source business changes
    useEffect(() => {
        setSelectedClientIds(new Set());
    }, [sourceBusinessId]);

    const handleSelectClient = (clientId: string) => {
        const newSelected = new Set(selectedClientIds);
        if (newSelected.has(clientId)) {
            newSelected.delete(clientId);
        } else {
            newSelected.add(clientId);
        }
        setSelectedClientIds(newSelected);
    };

    const handleSelectAll = () => {
        if (!sourceClients) return;

        if (selectedClientIds.size === sourceClients.length) {
            // Deselect all
            setSelectedClientIds(new Set());
        } else {
            // Select all
            setSelectedClientIds(new Set(sourceClients.map(c => c.id)));
        }
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (selectedClientIds.size === 0) {
            return;
        }
        importMutation.mutate();
    };

    // Filtrar negocios (excluir el actual)
    const availableBusinesses = businesses?.filter(b => b.id !== currentBusinessId) || [];

    const selectedCount = selectedClientIds.size;
    const allSelected = sourceClients && selectedClientIds.size === sourceClients.length;

    // Show results after import
    const importResult = importMutation.data?.data;

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
                {/* Header */}
                <div className="flex items-center justify-between p-6 border-b border-gray-200">
                    <h2 className="text-xl font-bold text-gray-900">
                        Importar Clientes desde Otro Negocio
                    </h2>
                    <button
                        onClick={onClose}
                        className="text-gray-400 hover:text-gray-600 transition-colors"
                    >
                        <X className="w-6 h-6" />
                    </button>
                </div>

                {/* Content */}
                <form onSubmit={handleSubmit} className="flex flex-col flex-1 overflow-hidden">
                    <div className="p-6 space-y-6 overflow-y-auto flex-1">
                        {/* Business Selector */}
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                                Negocio Origen
                            </label>
                            <select
                                value={sourceBusinessId}
                                onChange={(e) => setSourceBusinessId(e.target.value)}
                                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                disabled={loadingBusinesses || importMutation.isPending}
                                required
                            >
                                <option value="">Selecciona un negocio...</option>
                                {loadingBusinesses && <option>Cargando negocios...</option>}
                                {availableBusinesses.map((business) => (
                                    <option key={business.id} value={business.id}>
                                        {business.name}
                                    </option>
                                ))}
                            </select>
                            {availableBusinesses.length === 0 && !loadingBusinesses && (
                                <p className="text-sm text-amber-600 mt-2">
                                    No hay otros negocios disponibles
                                </p>
                            )}
                        </div>

                        {/* Clients List */}
                        {sourceBusinessId && (
                            <div>
                                <div className="flex items-center justify-between mb-3">
                                    <label className="text-sm font-medium text-gray-700">
                                        Clientes Disponibles ({sourceClients?.length || 0})
                                    </label>
                                    {sourceClients && sourceClients.length > 0 && (
                                        <button
                                            type="button"
                                            onClick={handleSelectAll}
                                            className="text-sm text-blue-600 hover:text-blue-700 font-medium"
                                        >
                                            {allSelected ? 'Deseleccionar todos' : 'Seleccionar todos'}
                                        </button>
                                    )}
                                </div>

                                <div className="border border-gray-300 rounded-lg max-h-64 overflow-y-auto">
                                    {loadingClients ? (
                                        <div className="p-8 text-center text-gray-500">
                                            Cargando clientes...
                                        </div>
                                    ) : sourceClients && sourceClients.length > 0 ? (
                                        <div className="divide-y divide-gray-200">
                                            {sourceClients.map((client) => (
                                                <label
                                                    key={client.id}
                                                    className="flex items-center gap-3 p-3 hover:bg-gray-50 cursor-pointer transition-colors"
                                                >
                                                    <div className="flex-shrink-0">
                                                        {selectedClientIds.has(client.id) ? (
                                                            <CheckSquare className="w-5 h-5 text-blue-600" />
                                                        ) : (
                                                            <Square className="w-5 h-5 text-gray-400" />
                                                        )}
                                                    </div>
                                                    <input
                                                        type="checkbox"
                                                        checked={selectedClientIds.has(client.id)}
                                                        onChange={() => handleSelectClient(client.id)}
                                                        className="sr-only"
                                                    />
                                                    <div className="flex-1 min-w-0">
                                                        <p className="font-medium text-gray-900">
                                                            {client.fullName}
                                                        </p>
                                                        <p className="text-sm text-gray-500">
                                                            {client.phone} • {client.cedula}
                                                        </p>
                                                    </div>
                                                </label>
                                            ))}
                                        </div>
                                    ) : (
                                        <div className="p-8 text-center text-gray-500">
                                            No hay clientes en este negocio
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}

                        {/* Selected Count */}
                        {selectedCount > 0 && (
                            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                                <p className="text-sm font-medium text-blue-900">
                                    {selectedCount} cliente{selectedCount > 1 ? 's' : ''} seleccionado{selectedCount > 1 ? 's' : ''}
                                </p>
                            </div>
                        )}

                        {/* Import Results */}
                        {importResult && (
                            <div className={`rounded-lg p-4 border ${importResult.failed === 0
                                    ? 'bg-green-50 border-green-200'
                                    : 'bg-yellow-50 border-yellow-200'
                                }`}>
                                <div className="flex items-start gap-3">
                                    {importResult.failed === 0 ? (
                                        <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
                                    ) : (
                                        <AlertCircle className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
                                    )}
                                    <div className="flex-1">
                                        <p className={`text-sm font-medium ${importResult.failed === 0 ? 'text-green-900' : 'text-yellow-900'
                                            }`}>
                                            {importResult.imported} cliente(s) importado(s) exitosamente
                                            {importResult.failed > 0 && `, ${importResult.failed} fallaron`}
                                        </p>
                                        {importResult.failed > 0 && (
                                            <div className="mt-2 space-y-1">
                                                {importResult.results
                                                    .filter(r => !r.success)
                                                    .map((result, idx) => (
                                                        <p key={idx} className="text-xs text-yellow-800">
                                                            • {result.error}
                                                        </p>
                                                    ))}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Error Display */}
                        {importMutation.isError && (
                            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                                <p className="text-sm text-red-800">
                                    {importMutation.error instanceof Error
                                        ? importMutation.error.message
                                        : 'Error al importar clientes'}
                                </p>
                            </div>
                        )}
                    </div>

                    {/* Actions */}
                    <div className="flex gap-3 p-6 border-t border-gray-200">
                        <button
                            type="button"
                            onClick={onClose}
                            className="flex-1 px-4 py-2.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors font-medium"
                        >
                            {importResult ? 'Cerrar' : 'Cancelar'}
                        </button>
                        {!importResult && (
                            <button
                                type="submit"
                                disabled={selectedCount === 0 || importMutation.isPending}
                                className="flex-1 px-4 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {importMutation.isPending
                                    ? 'Importando...'
                                    : `Importar ${selectedCount > 0 ? `${selectedCount} Cliente${selectedCount > 1 ? 's' : ''}` : 'Clientes'}`}
                            </button>
                        )}
                    </div>
                </form>
            </div>
        </div>
    );
};
