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
            if (client.referredBy) setReferralSearch(client.referredBy.fullName);
        }
    }, [client]);

    const { data: businesses } = useQuery({
        queryKey: ['businesses'],
        queryFn: getBusinesses,
        enabled: ['admin', 'super_admin'].includes(user?.role || ''),
    });

    useEffect(() => {
        const isSuperAdmin = user?.role === 'super_admin';
        if (isSuperAdmin && businesses && businesses.length > 0 && !formData.businessId && !client) {
            setFormData((prev) => ({ ...prev, businessId: businesses[0].id }));
        }
    }, [businesses, client, formData.businessId, user?.role]);

    useEffect(() => {
        const isAdmin = ['admin', 'super_admin'].includes(user?.role || '');
        if (isAdmin && selectedBusinessId && !client) {
            setFormData((prev) => ({ ...prev, businessId: selectedBusinessId }));
        }
    }, [client, selectedBusinessId, user?.role]);

    const { data: referralResults } = useQuery({
        queryKey: ['clients', 'search', referralSearch],
        queryFn: () => searchClients(referralSearch, formData.businessId),
        enabled: referralSearch.length > 2 && showReferralResults && (user?.role !== 'super_admin' || !!formData.businessId),
    });

    const createMutation = useMutation({
        mutationFn: createClient,
        onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['clients'] }); onSuccess(); },
        onError: (err: any) => {
            const errors = err.response?.data?.errors;
            setError(Array.isArray(errors) && errors.length > 0 ? errors[0].msg : err.response?.data?.error || 'Error al crear el cliente');
        },
    });

    const updateMutation = useMutation({
        mutationFn: ({ id, data }: { id: string; data: CreateClientData }) => updateClient(id, data),
        onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['clients'] }); onSuccess(); },
        onError: (err: any) => {
            const errors = err.response?.data?.errors;
            setError(Array.isArray(errors) && errors.length > 0 ? errors[0].msg : err.response?.data?.error || 'Error al actualizar el cliente');
        },
    });

    const handleSubmit = () => {
        setError('');
        if (!formData.fullName.trim()) return setError('El nombre es requerido');
        if (!formData.phone.match(/^3\d{9}$/)) return setError('El celular debe tener 10 dígitos y comenzar con 3');
        if (!formData.cedula.match(/^\d{6,15}$/)) return setError('El documento debe tener entre 6 y 15 dígitos');
        if (!formData.nationality.match(/^[a-záéíóúñA-ZÁÉÍÓÚÑ\s]{3,}$/)) return setError('La nacionalidad debe tener al menos 3 letras');
        if (user?.role === 'super_admin' && !formData.businessId) return setError('Seleccione un negocio para crear el cliente');

        const payload: CreateClientData = {
            ...formData,
            businessId: client ? undefined : (formData.businessId || undefined),
            referredById: formData.referredById ? formData.referredById : undefined,
            address: formData.address || undefined,
        };

        if (client) updateMutation.mutate({ id: client.id, data: payload });
        else createMutation.mutate(payload);
    };

    const handleReferralSelect = (referral: Client) => {
        setFormData({ ...formData, referredById: referral.id });
        setReferralSearch(referral.fullName);
        setShowReferralResults(false);
    };

    const isLoading = createMutation.isPending || updateMutation.isPending;
    const isSuperAdmin = user?.role === 'super_admin';

    return (
        <div className="fixed inset-0 z-[100] flex flex-col bg-black/60">
            <div className="
                flex flex-col bg-white w-full h-full
                sm:rounded-xl sm:shadow-2xl sm:w-full sm:max-w-2xl
                sm:h-auto sm:max-h-[90vh]
                sm:m-auto
            ">
                {/* ── HEADER FIJO ── */}
                <div className="flex justify-between items-center px-5 py-4 border-b border-gray-200 bg-white shrink-0">
                    <h2 className="text-lg font-bold text-gray-900">
                        {client ? 'Editar Cliente' : 'Nuevo Cliente'}
                    </h2>
                    <button onClick={onClose} className="p-2 rounded-xl text-gray-500 hover:text-gray-900 hover:bg-gray-100 transition">
                        <X size={22} />
                    </button>
                </div>

                {/* ── CONTENIDO SCROLLABLE ── */}
                <div className="flex-1 overflow-y-auto overscroll-contain">
                    <div className="px-5 py-4 space-y-4">
                        {error && (
                            <div className="bg-red-50 border border-red-200 text-red-700 p-3 rounded-xl text-sm">{error}</div>
                        )}

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {/* Negocio */}
                            {isSuperAdmin && !client && (
                                <div className="md:col-span-2">
                                    <label className="block text-sm font-semibold text-gray-700 mb-1">Negocio *</label>
                                    <select
                                        value={formData.businessId}
                                        onChange={(e) => setFormData({ ...formData, businessId: e.target.value })}
                                        className="w-full px-3 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 bg-white text-gray-900"
                                        required
                                    >
                                        <option value="">Seleccione un negocio</option>
                                        {businesses?.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                                    </select>
                                </div>
                            )}

                            {/* Nombre */}
                            <div className="md:col-span-2">
                                <label className="block text-sm font-semibold text-gray-700 mb-1">Nombre Completo *</label>
                                <input
                                    type="text"
                                    value={formData.fullName}
                                    onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
                                    className="w-full px-3 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 text-gray-900"
                                    placeholder="Nombre completo del cliente"
                                    required minLength={3} maxLength={100}
                                />
                            </div>

                            {/* Celular */}
                            <div>
                                <label className="block text-sm font-semibold text-gray-700 mb-1">Celular *</label>
                                <input
                                    type="tel"
                                    value={formData.phone}
                                    onChange={(e) => {
                                        const val = e.target.value.replace(/\D/g, '');
                                        if (val.length <= 10) setFormData({ ...formData, phone: val });
                                    }}
                                    className="w-full px-3 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 text-gray-900"
                                    placeholder="3XXXXXXXXX"
                                />
                                <p className="text-xs text-gray-500 mt-1">10 dígitos, inicia con 3</p>
                            </div>

                            {/* Cédula */}
                            <div>
                                <label className="block text-sm font-semibold text-gray-700 mb-1">Documento / Cédula *</label>
                                <input
                                    type="text"
                                    value={formData.cedula}
                                    onChange={(e) => {
                                        const val = e.target.value.replace(/\D/g, '');
                                        setFormData({ ...formData, cedula: val });
                                    }}
                                    className="w-full px-3 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 text-gray-900"
                                    placeholder="12345678"
                                    required minLength={6} maxLength={10}
                                />
                            </div>

                            {/* Nacionalidad */}
                            <div>
                                <label className="block text-sm font-semibold text-gray-700 mb-1">Nacionalidad *</label>
                                <input
                                    type="text"
                                    value={formData.nationality}
                                    onChange={(e) => setFormData({ ...formData, nationality: e.target.value })}
                                    className="w-full px-3 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 text-gray-900"
                                />
                            </div>

                            {/* Dirección */}
                            <div>
                                <label className="block text-sm font-semibold text-gray-700 mb-1">Dirección</label>
                                <input
                                    type="text"
                                    value={formData.address}
                                    onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                                    className="w-full px-3 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 text-gray-900"
                                    placeholder="Dirección (opcional)"
                                />
                            </div>

                            {/* Referido */}
                            <div className="md:col-span-2 relative">
                                <label className="block text-sm font-semibold text-gray-700 mb-1">Recomendado por</label>
                                <div className="relative">
                                    <input
                                        type="text"
                                        value={referralSearch}
                                        onChange={(e) => {
                                            setReferralSearch(e.target.value);
                                            setShowReferralResults(true);
                                            if (e.target.value === '') setFormData({ ...formData, referredById: '' });
                                        }}
                                        className="w-full px-3 py-3 pl-10 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 text-gray-900"
                                        placeholder="Buscar por nombre o celular..."
                                    />
                                    <Search className="absolute left-3 top-3.5 text-gray-400" size={18} />
                                </div>
                                {showReferralResults && referralResults && referralResults.length > 0 && (
                                    <div className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-xl shadow-lg max-h-40 overflow-y-auto">
                                        {referralResults.map((ref) => (
                                            <button
                                                key={ref.id}
                                                type="button"
                                                onClick={() => handleReferralSelect(ref)}
                                                className="w-full text-left px-4 py-3 hover:bg-primary-50 border-b last:border-0"
                                            >
                                                <div className="font-medium text-gray-900">{ref.fullName}</div>
                                                <div className="text-xs text-gray-500">{ref.phone} - {ref.cedula}</div>
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>

                {/* ── FOOTER FIJO - SIEMPRE VISIBLE ── */}
                <div className="shrink-0 border-t border-gray-200 bg-white px-5 py-4 flex gap-3">
                    <button
                        type="button"
                        onClick={onClose}
                        className="flex-1 py-3.5 px-4 text-gray-700 bg-gray-100 rounded-2xl hover:bg-gray-200 active:bg-gray-300 transition font-semibold text-sm"
                    >
                        Cancelar
                    </button>
                    <button
                        type="button"
                        onClick={handleSubmit}
                        disabled={isLoading}
                        className="flex-1 flex items-center justify-center gap-2 py-3.5 px-4 bg-primary-600 text-white rounded-2xl hover:bg-primary-700 active:bg-primary-800 transition font-semibold text-sm disabled:opacity-50 shadow-lg shadow-primary-200"
                    >
                        <Save size={18} />
                        {isLoading ? 'Guardando...' : (client ? 'Actualizar' : 'Guardar Cliente')}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default ClientForm;
