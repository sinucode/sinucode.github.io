import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Trash2 } from 'lucide-react';
import {
    getAuditLogs,
    exportAuditLogs,
    deleteAuditLog,
    type AuditLogFilters,
} from '../../api/audit.api';
import { useAuthStore } from '../../store/authStore';

export default function AuditLogsViewer() {
    const queryClient = useQueryClient();
    const { user } = useAuthStore();
    const [filters, setFilters] = useState<AuditLogFilters>({
        page: 1,
        limit: 20,
    });
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [isExporting, setIsExporting] = useState(false);

    const { data, isLoading } = useQuery({
        queryKey: ['auditLogs', filters],
        queryFn: () => getAuditLogs(filters),
    });

    const deleteMutation = useMutation({
        mutationFn: deleteAuditLog,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['auditLogs'] });
        },
    });

    const handleApplyFilters = () => {
        setFilters({
            ...filters,
            startDate: startDate ? new Date(startDate) : undefined,
            endDate: endDate ? new Date(endDate) : undefined,
            page: 1,
        });
    };

    const handleExport = async () => {
        setIsExporting(true);
        try {
            const blob = await exportAuditLogs({
                startDate: startDate ? new Date(startDate) : undefined,
                endDate: endDate ? new Date(endDate) : undefined,
            });

            // Crear URL y descargar con extensión .xlsx
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `audit_logs_${new Date().toISOString().split('T')[0]}.xlsx`;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);
        } catch (error) {
            console.error('Error exporting logs:', error);
        } finally {
            setIsExporting(false);
        }
    };

    const handleDelete = async (id: string) => {
        if (window.confirm('¿Estás seguro de eliminar este log? Esta acción no se puede deshacer.')) {
            deleteMutation.mutate(id);
        }
    };

    const formatDate = (dateString: string) => {
        return new Date(dateString).toLocaleString('es-CO', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
        });
    };

    return (
        <div>
            <h2 className="text-xl font-semibold mb-6">Logs de Auditoría</h2>

            {/* Filtros */}
            <div className="bg-white rounded-lg shadow p-4 mb-6">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                            Fecha Inicio
                        </label>
                        <input
                            type="date"
                            value={startDate}
                            onChange={(e) => setStartDate(e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                            Fecha Fin
                        </label>
                        <input
                            type="date"
                            value={endDate}
                            onChange={(e) => setEndDate(e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
                        />
                    </div>

                    <div className="flex items-end gap-2">
                        <button
                            onClick={handleApplyFilters}
                            className="flex-1 bg-primary-600 text-white px-4 py-2 rounded-md hover:bg-primary-700"
                        >
                            Filtrar
                        </button>
                        <button
                            onClick={handleExport}
                            disabled={isExporting}
                            className="flex-1 bg-green-600 text-white px-4 py-2 rounded-md hover:bg-green-700 disabled:opacity-50 flex items-center justify-center gap-2"
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
                                <path d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path>
                            </svg>
                            {isExporting ? 'Exportando...' : 'Exportar'}
                        </button>
                    </div>
                </div>
            </div>

            {/* Tabla de logs */}
            <div className="bg-white rounded-lg shadow overflow-hidden">
                {isLoading ? (
                    <div className="flex justify-center items-center py-12">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
                    </div>
                ) : (
                    <>
                        <div className="overflow-x-auto">
                            <table className="min-w-full divide-y divide-gray-200">
                                <thead className="bg-gray-50">
                                    <tr>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                            Fecha/Hora
                                        </th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                            Usuario
                                        </th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                            Acción
                                        </th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                            Entidad
                                        </th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                            Descripción
                                        </th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                            IP
                                        </th>
                                        {(user?.role === 'super_admin' || user?.role === 'SUPER_ADMIN') && (
                                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                                Acciones
                                            </th>
                                        )}
                                    </tr>
                                </thead>
                                <tbody className="bg-white divide-y divide-gray-200">
                                    {data?.logs.map((log) => (
                                        <tr key={log.id}>
                                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                                {formatDate(log.createdAt)}
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap">
                                                <div className="text-sm font-medium text-gray-900">
                                                    {log.user?.fullName || 'N/A'}
                                                </div>
                                                <div className="text-sm text-gray-500">
                                                    {log.user?.email || 'N/A'}
                                                </div>
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap">
                                                <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-blue-100 text-blue-800">
                                                    {log.action}
                                                </span>
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                                {log.entityType || 'N/A'}
                                            </td>
                                            <td className="px-6 py-4 text-sm text-gray-500 max-w-xs truncate" title={log.description}>
                                                {log.description || 'N/A'}
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                                {log.ipAddress || 'N/A'}
                                            </td>
                                            {(user?.role === 'super_admin' || user?.role === 'SUPER_ADMIN') && (
                                                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                                                    <button
                                                        onClick={() => handleDelete(log.id)}
                                                        className="text-red-600 hover:text-red-900 transition-colors duration-200"
                                                        title="Eliminar registro"
                                                    >
                                                        <Trash2 className="h-5 w-5" />
                                                    </button>
                                                </td>
                                            )}
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        {data?.logs.length === 0 && (
                            <div className="text-center py-12 text-gray-500">
                                No se encontraron logs de auditoría
                            </div>
                        )}

                        {/* Paginación */}
                        {data && data.pagination.totalPages > 1 && (
                            <div className="bg-gray-50 px-6 py-3 flex items-center justify-between border-t border-gray-200">
                                <div className="text-sm text-gray-700">
                                    Mostrando página {data.pagination.page} de{' '}
                                    {data.pagination.totalPages} ({data.pagination.total} total)
                                </div>
                                <div className="flex gap-2">
                                    <button
                                        onClick={() =>
                                            setFilters({
                                                ...filters,
                                                page: Math.max(1, filters.page! - 1),
                                            })
                                        }
                                        disabled={filters.page === 1}
                                        className="px-3 py-1 border border-gray-300 rounded-md disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-100"
                                    >
                                        Anterior
                                    </button>
                                    <button
                                        onClick={() =>
                                            setFilters({
                                                ...filters,
                                                page: (filters.page || 1) + 1,
                                            })
                                        }
                                        disabled={filters.page === data.pagination.totalPages}
                                        className="px-3 py-1 border border-gray-300 rounded-md disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-100"
                                    >
                                        Siguiente
                                    </button>
                                </div>
                            </div>
                        )}
                    </>
                )}
            </div>
        </div>
    );
}
