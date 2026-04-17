import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { getCredits } from '../api/credits.api';
import CreditForm from '../components/credits/CreditForm';
import { Plus } from 'lucide-react';
import { useAuthStore } from '../store/authStore';
import { getBusinesses } from '../api/business.api';
import { useBusinessStore } from '../store/businessStore';
import { Credit } from '../types';
import { formatDate, isOverdueBogota } from '../utils/dates';
import { PaymentFrequency } from '../types';

const frequencyLabels: Record<PaymentFrequency, string> = {
    daily: 'Diario',
    weekly: 'Semanal',
    bisemanal: 'Bisemanal',
    quincenal: 'Quincenal',
    monthly: 'Mensual',
};

export default function CreditsPage() {
    const navigate = useNavigate();
    const queryParams = new URLSearchParams(window.location.search);
    const initialFilter = (queryParams.get('filter') as 'all' | 'dueToday' | 'overdue') || 'all';

    const [isFormOpen, setIsFormOpen] = useState(false);
    const [filter, setFilter] = useState<'all' | 'dueToday' | 'overdue'>(initialFilter);
    const [searchQuery, setSearchQuery] = useState('');
    const { selectedBusinessId, setSelectedBusiness } = useBusinessStore();
    const { user } = useAuthStore();
    const isAdmin = ['admin', 'super_admin'].includes(user?.role || '');

    const { data: businesses } = useQuery({
        queryKey: ['businesses'],
        queryFn: getBusinesses,
        enabled: isAdmin,
    });

    const { data: credits, isLoading, refetch } = useQuery<Credit[]>({
        queryKey: ['credits', filter, selectedBusinessId],
        queryFn: () =>
            getCredits({
                ...(filter === 'dueToday' ? { dueToday: true } : {}),
                ...(filter === 'overdue' ? { overdue: true } : {}),
                ...(selectedBusinessId ? { businessId: selectedBusinessId } : {}),
            }),
    });

    const handleCreated = (id: string) => {
        setIsFormOpen(false);
        refetch();
        navigate(`/credits/${id}`);
    };

    const filteredCredits = credits?.filter((credit) => {
        if (!searchQuery) return true;
        const query = searchQuery.toLowerCase();
        return (
            credit.client?.fullName.toLowerCase().includes(query) ||
            credit.client?.phone.includes(query) ||
            credit.client?.cedula?.includes(query) ||
            credit.amount.toString().includes(query) ||
            credit.status.toLowerCase().includes(query) ||
            frequencyLabels[credit.paymentFrequency as PaymentFrequency].toLowerCase().includes(query)
        );
    });

    return (
        <div className="space-y-4">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-gray-800">Créditos</h1>
                    <p className="text-gray-600">Gestión de créditos, cuotas y pagos</p>
                </div>
                <button
                    onClick={() => setIsFormOpen(true)}
                    className="bg-primary-500 text-white px-4 py-2 rounded-md flex items-center gap-2 hover:bg-primary-600 transition-colors"
                >
                    <Plus size={18} /> Nuevo Crédito
                </button>
            </div>

            <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200 flex flex-col md:flex-row justify-between items-center gap-4">
                <div className="flex gap-2 w-full md:w-auto overflow-x-auto pb-2 md:pb-0">
                    <FilterChip label="Todos" active={filter === 'all'} onClick={() => setFilter('all')} />
                    <FilterChip label="Cobro hoy" active={filter === 'dueToday'} onClick={() => setFilter('dueToday')} />
                    <FilterChip label="En mora" active={filter === 'overdue'} onClick={() => setFilter('overdue')} />
                </div>
                {isAdmin && (
                    <div className="w-full md:w-1/3 min-w-[200px]">
                        <select
                            value={selectedBusinessId}
                            onChange={(e) => {
                                const id = e.target.value;
                                const name = id ? businesses?.find(b => b.id === id)?.name || '' : 'Todos los negocios';
                                setSelectedBusiness(id, name);
                            }}
                            className="w-full px-3 py-2 border border-primary-200 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
                        >
                            <option value="">Todos los negocios</option>
                            {businesses?.map((b) => (
                                <option key={b.id} value={b.id}>
                                    {b.name}
                                </option>
                            ))}
                        </select>
                    </div>
                )}
            </div>

            <div className="bg-white rounded-lg shadow-sm border border-gray-200">
                <div className="p-4 border-b border-gray-200">
                    <input
                        type="text"
                        placeholder="Buscar por cliente, documento, monto, estado..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-primary-500 focus:outline-none"
                    />
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-left">
                        <thead className="bg-white text-xs uppercase text-primary-600">
                            <tr>
                                <th className="px-4 py-3">Cliente</th>
                                <th className="px-4 py-3">Monto</th>
                                <th className="px-4 py-3">Frecuencia</th>
                                <th className="px-4 py-3">Saldo</th>
                                <th className="px-4 py-3">Estado</th>
                                <th className="px-4 py-3">Próximo venc.</th>
                                <th className="px-4 py-3">Finalización</th>
                                <th className="px-4 py-3">Rentabilidad</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y">
                            {isLoading && (
                                <tr>
                                    <td colSpan={8} className="px-4 py-6 text-center text-primary-600">
                                        Cargando...
                                    </td>
                                </tr>
                            )}
                            {!isLoading && credits?.length === 0 && (
                                <tr>
                                    <td colSpan={8} className="px-4 py-6 text-center text-primary-600">
                                        No hay créditos registrados
                                    </td>
                                </tr>
                            )}
                            {filteredCredits?.map((credit) => {
                                const nextDue = credit.paymentSchedule
                                    ? credit.paymentSchedule.find((p: any) => p.status !== 'paid')
                                    : null;

                                const isOverdue = credit.status === 'overdue' || (credit.paymentSchedule && credit.paymentSchedule.some((p: any) => p.status === 'pending' && isOverdueBogota(p.dueDate)));

                                let displayStatus = 'Activo';
                                let statusColor = 'bg-emerald-100 text-emerald-800';

                                if (credit.status === 'paid') {
                                    displayStatus = 'Completado';
                                    statusColor = 'bg-blue-100 text-blue-800';
                                } else if (isOverdue) {
                                    displayStatus = 'En mora';
                                    statusColor = 'bg-red-100 text-red-800';
                                }

                                const isCompleted = credit.status === 'paid';
                                const rentabilidad = isCompleted && credit.earnedInterest 
                                    ? Number(credit.earnedInterest) 
                                    : 0;

                                return (
                                    <tr
                                        key={credit.id}
                                        className="hover:bg-primary-50 cursor-pointer"
                                        onClick={() => navigate(`/credits/${credit.id}`)}
                                    >
                                        <td className="px-4 py-3">
                                            <div className="font-medium text-gray-900">{credit.client?.fullName || credit.clientId}</div>
                                            <div className="text-xs text-primary-600">{credit.client?.phone}</div>
                                        </td>
                                        <td className="px-4 py-3 text-primary-900 font-semibold">${Number(credit.amount).toLocaleString('es-CO', { maximumFractionDigits: 0 })}</td>
                                        <td className="px-4 py-3">
                                            <span className="text-xs font-medium text-primary-700 bg-primary-50 px-2 py-1 rounded-md border border-primary-100">
                                                {frequencyLabels[credit.paymentFrequency as PaymentFrequency] || credit.paymentFrequency}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3 text-primary-900">${Number(credit.remainingBalance).toLocaleString('es-CO', { maximumFractionDigits: 0 })}</td>
                                        <td className="px-4 py-3">
                                            <span className={`px-2 py-1 rounded-full text-xs font-medium ${statusColor}`}>
                                                {displayStatus}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3 text-primary-900">
                                            {nextDue ? formatDate((nextDue as any).dueDate) : '-'}
                                        </td>
                                        <td className="px-4 py-3 text-primary-900">
                                            {isCompleted && credit.completionDate ? formatDate(credit.completionDate) : '-'}
                                        </td>
                                        <td className="px-4 py-3 font-semibold text-emerald-700">
                                            {isCompleted ? `$${rentabilidad.toLocaleString('es-CO', { maximumFractionDigits: 0 })}` : '$0'}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>

            {isFormOpen && (
                <CreditForm
                    onClose={() => setIsFormOpen(false)}
                    onCreated={handleCreated}
                    selectedBusinessId={selectedBusinessId}
                />
            )}
        </div>
    );
}

function FilterChip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
    return (
        <button
            onClick={onClick}
            className={`px-3 py-1 rounded-full text-sm border ${active ? 'bg-primary-500 text-white border-primary-600' : 'text-primary-900 border-primary-200 hover:bg-slate-50'
                }`}
        >
            {label}
        </button>
    );
}
