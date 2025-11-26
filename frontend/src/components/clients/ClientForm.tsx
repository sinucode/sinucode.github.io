import React, { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { X, Save, Search } from 'lucide-react';
import { createClient, updateClient, Client, CreateClientData, searchClients } from '../../api/clients.api';
import { getBusinesses } from '../../api/business.api';
import { useAuthStore } from '../../store/authStore';

interface ClientFormProps {
    client?: Client;
    onClose: () => void;
    onSuccess: () => void;
    selectedBusinessId?: string;
}

const ClientForm: React.FC<ClientFormProps> = ({ client, onClose, onSuccess, selectedBusinessId }) => {
    const { user } = useAuthStore();
    const queryClient = useQueryClient();
    const [formData, setFormData] = useState<CreateClientData>({
        fullName: '',
        phone: '',
        cedula: '',
        nationality: 'Colombiana',
        address: '',
        referredById: '',
        businessId: selectedBusinessId || '',
    });
    const [error, setError] = useState('');
    const [referralSearch, setReferralSearch] = useState('');
    const [showReferralResults, setShowReferralResults] = useState(false);

    // Cargar datos si es edición
    useEffect(() => {
        if (client) {
            setFormData({
                fullName: client.fullName,
                phone: client.phone,
                cedula: client.cedula,
                nationality: client.nationality,
                address: client.address || '',
                referredById: client.referredById || '',
                businessId: client.businessId,
            });
            if (client.referredBy) {
                setReferralSearch(client.referredBy.fullName);
            }
        }
    }, [client]);

    // Cargar negocios para admin/super_admin
    const { data: businesses } = useQuery({
        queryKey: ['businesses'],
        queryFn: getBusinesses,
        enabled: ['admin', 'super_admin'].includes(user?.role || ''),
    });

    // Autoseleccionar el primer negocio para admin si no hay uno elegido
    useEffect(() => {
        const isAdmin = ['admin', 'super_admin'].includes(user?.role || '');
        if (isAdmin && businesses && businesses.length > 0 && !formData.businessId && !client) {
            setFormData((prev) => ({ ...prev, businessId: businesses[0].id }));
        }
    }, [businesses, client, formData.businessId, user?.role]);

    // Alinear con el negocio seleccionado anteriormente en la vista de lista
    useEffect(() => {
        const isAdmin = ['admin', 'super_admin'].includes(user?.role || '');
        if (isAdmin && selectedBusinessId && !client) {
            setFormData((prev) => ({ ...prev, businessId: selectedBusinessId }));
        }
    }, [client, selectedBusinessId, user?.role]);

    // Buscar referidos
    const { data: referralResults } = useQuery({
        queryKey: ['clients', 'search', referralSearch],
        queryFn: () => searchClients(referralSearch, formData.businessId),
        enabled:
            referralSearch.length > 2 &&
            showReferralResults &&
            (!['admin', 'super_admin'].includes(user?.role || '') || !!formData.businessId),
    });

    const createMutation = useMutation({
        mutationFn: createClient,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['clients'] });
            onSuccess();
        },
        onError: (err: any) => {
            const errors = err.response?.data?.errors;
            if (Array.isArray(errors) && errors.length > 0) {
                setError(errors[0].msg);
                return;
            }
            setError(err.response?.data?.error || 'Error al crear el cliente');
        },
    });

    const updateMutation = useMutation({
        mutationFn: ({ id, data }: { id: string; data: CreateClientData }) =>
            updateClient(id, data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['clients'] });
            onSuccess();
        },
        onError: (err: any) => {
            const errors = err.response?.data?.errors;
            if (Array.isArray(errors) && errors.length > 0) {
                setError(errors[0].msg);
                return;
            }
            setError(err.response?.data?.error || 'Error al actualizar el cliente');
        },
    });

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        setError('');

        // Validaciones básicas frontend (alineadas con backend)
        if (!formData.fullName.trim()) return setError('El nombre es requerido');
        if (!formData.phone.match(/^3\d{9}$/)) return setError('El celular debe tener 10 dígitos y comenzar con 3');
        if (!formData.cedula.match(/^\d{6,15}$/)) return setError('El documento debe tener entre 6 y 15 dígitos');
        if (!formData.nationality.match(/^[a-záéíóúñA-ZÁÉÍÓÚÑ\s]{3,}$/)) return setError('La nacionalidad debe tener al menos 3 letras');
        if (['admin', 'super_admin'].includes(user?.role || '') && !formData.businessId) {
            return setError('Seleccione un negocio para crear el cliente');
        }

        // Normalizar payload para evitar strings vacíos que rompan validación backend
        const payload: CreateClientData = {
            ...formData,
            businessId: client ? undefined : (formData.businessId || undefined), // no enviar businessId en edición
            referredById: formData.referredById ? formData.referredById : (client ? null : undefined),
            address: formData.address || undefined,
        };

        if (client) {
            updateMutation.mutate({ id: client.id, data: payload });
        } else {
            createMutation.mutate(payload);
        }
    };

    const handleReferralSelect = (referral: Client) => {
        setFormData({ ...formData, referredById: referral.id });
        setReferralSearch(referral.fullName);
        setShowReferralResults(false);
    };

    const isLoading = createMutation.isPending || updateMutation.isPending;
    const isAdmin = ['admin', 'super_admin'].includes(user?.role || '');

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
                <div className="flex justify-between items-center p-6 border-b">
                    <h2 className="text-xl font-semibold text-gray-800">
                        {client ? 'Editar Cliente' : 'Nuevo Cliente'}
                    </h2>
                    <button onClick={onClose} className="text-gray-500 hover:text-gray-700">
                        <X size={24} />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="p-6 space-y-6">
                    {error && (
                        <div className="bg-red-50 text-red-600 p-3 rounded-md text-sm">
                            {error}
                        </div>
                    )}

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {/* Selector de Negocio (Solo Admin) */}
                        {isAdmin && !client && (
                            <div className="md:col-span-2">
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    Negocio *
                                </label>
                                <select
                                    value={formData.businessId}
                                    onChange={(e) => setFormData({ ...formData, businessId: e.target.value })}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
                                    required
                                >
                                    <option value="">Seleccione un negocio</option>
                                    {businesses?.map((b) => (
                                        <option key={b.id} value={b.id}>
                                            {b.name}
                                        </option>
                                    ))}
                                </select>
                            </div>
                        )}

                        {/* Nombre Completo */}
                        <div className="md:col-span-2">
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                Nombre Completo *
                            </label>
                            <input
                                type="text"
                                value={formData.fullName}
                                onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
                                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
                                required
                                minLength={3}
                                maxLength={100}
                            />
                        </div>

                        {/* Celular */}
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                Celular *
                            </label>
                            <input
                                type="tel"
                                value={formData.phone}
                                onChange={(e) => {
                                    const val = e.target.value.replace(/\D/g, '');
                                    if (val.length <= 10) setFormData({ ...formData, phone: val });
                                }}
                                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
                                required
                                placeholder="3XXXXXXXXX"
                            />
                            <p className="text-xs text-gray-500 mt-1">10 dígitos, inicia con 3</p>
                        </div>

                        {/* Cédula */}
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                Documento / Cédula *
                            </label>
                            <input
                                type="text"
                                value={formData.cedula}
                                onChange={(e) => {
                                    const val = e.target.value.replace(/\D/g, '');
                                    setFormData({ ...formData, cedula: val });
                                }}
                                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
                                required
                                minLength={6}
                                maxLength={10}
                            />
                        </div>

                        {/* Nacionalidad */}
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                Nacionalidad *
                            </label>
                            <input
                                type="text"
                                value={formData.nationality}
                                onChange={(e) => setFormData({ ...formData, nationality: e.target.value })}
                                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
                                required
                            />
                        </div>

                        {/* Dirección */}
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                Dirección
                            </label>
                            <input
                                type="text"
                                value={formData.address}
                                onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
                            />
                        </div>

                        {/* Recomendado por (Autocomplete) */}
                        <div className="md:col-span-2 relative">
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                Recomendado por (Cliente existente)
                            </label>
                            <div className="relative">
                                <input
                                    type="text"
                                    value={referralSearch}
                                    onChange={(e) => {
                                        setReferralSearch(e.target.value);
                                        setShowReferralResults(true);
                                        if (e.target.value === '') setFormData({ ...formData, referredById: '' });
                                    }}
                                    className="w-full px-3 py-2 pl-10 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
                                    placeholder="Buscar por nombre o celular..."
                                />
                                <Search className="absolute left-3 top-2.5 text-gray-400" size={18} />
                            </div>

                            {showReferralResults && referralResults && referralResults.length > 0 && (
                                <div className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-md shadow-lg max-h-40 overflow-y-auto">
                                    {referralResults.map((ref) => (
                                        <button
                                            key={ref.id}
                                            type="button"
                                            onClick={() => handleReferralSelect(ref)}
                                            className="w-full text-left px-4 py-2 hover:bg-gray-50 focus:outline-none"
                                        >
                                            <div className="font-medium">{ref.fullName}</div>
                                            <div className="text-xs text-gray-500">{ref.phone} - {ref.cedula}</div>
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="flex justify-end gap-3 pt-4">
                        <button
                            type="button"
                            onClick={onClose}
                            className="px-4 py-2 text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200 transition-colors"
                        >
                            Cancelar
                        </button>
                        <button
                            type="submit"
                            disabled={isLoading}
                            className="px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700 transition-colors flex items-center gap-2 disabled:opacity-50"
                        >
                            <Save size={18} />
                            {isLoading ? 'Guardando...' : 'Guardar Cliente'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default ClientForm;
