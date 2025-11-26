import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Pencil, Trash2, Plus } from 'lucide-react';
import {
    getBusinesses,
    deleteBusiness,
    type Business,
} from '../api/business.api';
import { useAuthStore } from '../store/authStore';
import BusinessForm from '../components/business/BusinessForm';
import ConfirmDialog from '../components/common/ConfirmDialog';

export default function BusinessPage() {
    const queryClient = useQueryClient();
    const currentUser = useAuthStore((state) => state.user);
    const [showCreateForm, setShowCreateForm] = useState(false);
    const [editingBusiness, setEditingBusiness] = useState<Business | null>(null);
    const [businessToDelete, setBusinessToDelete] = useState<Business | null>(null);

    const { data: businesses, isLoading } = useQuery({
        queryKey: ['businesses'],
        queryFn: getBusinesses,
    });

    const deleteMutation = useMutation({
        mutationFn: deleteBusiness,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['businesses'] });
            setBusinessToDelete(null);
        },
        onError: (error: any) => {
            console.error('Error deleting business:', error);
            alert(error.response?.data?.error || 'Error al eliminar el negocio');
            setBusinessToDelete(null);
        },
    });

    const handleDeleteClick = (business: Business) => {
        setBusinessToDelete(business);
    };

    const handleConfirmDelete = () => {
        if (businessToDelete) {
            deleteMutation.mutate(businessToDelete.id);
        }
    };

    const formatCurrency = (amount: number) => {
        return new Intl.NumberFormat('es-CO', {
            style: 'currency',
            currency: 'COP',
            minimumFractionDigits: 0,
            maximumFractionDigits: 0,
        }).format(amount);
    };

    const formatDate = (dateString: string) => {
        return new Date(dateString).toLocaleDateString('es-CO', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
        });
    };

    const canManage = currentUser?.role === 'super_admin' || currentUser?.role === 'admin';

    if (isLoading) {
        return (
            <div className="flex justify-center items-center py-12">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
            </div>
        );
    }

    return (
        <div className="container mx-auto px-2 sm:px-4 py-4 sm:py-8">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-4 sm:mb-6 gap-3">
                <h1 className="text-xl sm:text-2xl font-bold">Negocios</h1>
                {canManage && (
                    <button
                        onClick={() => setShowCreateForm(true)}
                        className="w-full sm:w-auto bg-primary-600 text-white px-4 py-2 rounded-md hover:bg-primary-700 flex items-center justify-center gap-2"
                    >
                        <Plus className="w-5 h-5" />
                        Crear Negocio
                    </button>
                )}
            </div>

            <div className="bg-white rounded-lg shadow overflow-hidden">
                {/* Responsive table wrapper with horizontal scroll */}
                <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                            <tr>
                                <th className="px-3 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                    Nombre
                                </th>
                                {/* Hide description on very small screens */}
                                <th className="hidden md:table-cell px-3 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                    Descripción
                                </th>
                                <th className="px-3 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                    Capital Inicial
                                </th>
                                <th className="px-3 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                    Balance
                                </th>
                                {/* Hide created date on small screens */}
                                <th className="hidden lg:table-cell px-3 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                    Creado
                                </th>
                                {canManage && (
                                    <th className="px-3 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                        Acciones
                                    </th>
                                )}
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                            {businesses?.map((business) => (
                                <tr key={business.id} className="hover:bg-gray-50">
                                    <td className="px-3 sm:px-6 py-3 sm:py-4 whitespace-nowrap">
                                        <div className="text-sm font-medium text-gray-900">
                                            {business.name}
                                        </div>
                                        {/* Show description on mobile below name */}
                                        <div className="md:hidden text-xs text-gray-500 mt-1 line-clamp-2">
                                            {business.description || '—'}
                                        </div>
                                    </td>
                                    {/* Description column for larger screens */}
                                    <td className="hidden md:table-cell px-3 sm:px-6 py-4">
                                        <div className="text-sm text-gray-500 max-w-xs truncate">
                                            {business.description || '—'}
                                        </div>
                                    </td>
                                    <td className="px-3 sm:px-6 py-3 sm:py-4 whitespace-nowrap">
                                        <div className="text-xs sm:text-sm text-gray-900">
                                            {formatCurrency(business.initialCapital)}
                                        </div>
                                    </td>
                                    <td className="px-3 sm:px-6 py-3 sm:py-4 whitespace-nowrap">
                                        <div
                                            className={`text-xs sm:text-sm font-medium ${business.currentBalance >= 0
                                                ? 'text-green-600'
                                                : 'text-red-600'
                                                }`}
                                        >
                                            {formatCurrency(business.currentBalance)}
                                        </div>
                                    </td>
                                    {/* Created date for larger screens */}
                                    <td className="hidden lg:table-cell px-3 sm:px-6 py-4 whitespace-nowrap">
                                        <div className="text-sm text-gray-500">
                                            {formatDate(business.createdAt)}
                                        </div>
                                    </td>
                                    {canManage && (
                                        <td className="px-3 sm:px-6 py-3 sm:py-4 whitespace-nowrap text-right text-sm font-medium">
                                            <div className="flex items-center justify-end gap-2">
                                                {(currentUser?.role === 'super_admin' || currentUser?.role === 'admin') && (
                                                    <>
                                                        <button
                                                            onClick={() => setEditingBusiness(business)}
                                                            className="text-primary-600 hover:text-primary-900"
                                                            title="Editar"
                                                        >
                                                            <Pencil size={18} />
                                                        </button>
                                                        <button
                                                            onClick={() => handleDeleteClick(business)}
                                                            disabled={deleteMutation.isPending}
                                                            className="text-red-600 hover:text-red-900 disabled:opacity-50"
                                                            title="Eliminar"
                                                        >
                                                            <Trash2 size={18} />
                                                        </button>
                                                    </>
                                                )}
                                            </div>
                                        </td>
                                    )}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                {businesses?.length === 0 && (
                    <div className="text-center py-8 sm:py-12 text-gray-500 px-4">
                        {canManage
                            ? 'No hay negocios registrados. Crea uno para empezar.'
                            : 'No hay negocios disponibles.'}
                    </div>
                )}
            </div>

            {/* Modal for create/edit form */}
            {(showCreateForm || editingBusiness) && (
                <BusinessForm
                    onClose={() => {
                        setShowCreateForm(false);
                        setEditingBusiness(null);
                    }}
                    onSuccess={() => {
                        queryClient.invalidateQueries({ queryKey: ['businesses'] });
                        setShowCreateForm(false);
                        setEditingBusiness(null);
                    }}
                    initialData={editingBusiness || undefined}
                />
            )}

            {/* Confirmation dialog */}
            <ConfirmDialog
                isOpen={!!businessToDelete}
                title="Eliminar Negocio"
                message={`¿Estás seguro de eliminar el negocio "${businessToDelete?.name}"? Esta acción no se puede deshacer.`}
                confirmText="Eliminar"
                cancelText="Cancelar"
                onConfirm={handleConfirmDelete}
                onCancel={() => setBusinessToDelete(null)}
                isLoading={deleteMutation.isPending}
            />
        </div>
    );
}
