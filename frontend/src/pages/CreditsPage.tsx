import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { getCredits } from '../api/credits.api';
import CreditForm from '../components/credits/CreditForm';
import { Credit } from '../types';
import { Plus } from 'lucide-react';

export default function CreditsPage() {
    const navigate = useNavigate();
    const [isFormOpen, setIsFormOpen] = useState(false);
    const [filter, setFilter] = useState<'all' | 'dueToday' | 'overdue'>('all');

    const { data: credits, isLoading, refetch } = useQuery<Credit[]>({
        queryKey: ['credits', filter],
        queryFn: () =>
            getCredits({
                ...(filter === 'dueToday' ? { dueToday: true } : {}),
                ...(filter === 'overdue' ? { overdue: true } : {}),
            }),
    });

    const handleCreated = (id: string) => {
        setIsFormOpen(false);
        refetch();
        navigate(`/credits/${id}`);
    };

    return (
        <div className="space-y-4">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-gray-800">Créditos</h1>
                    <p className="text-gray-600">Gestión de créditos, cuotas y pagos</p>
                </div>
                <button
                    onClick={() => setIsFormOpen(true)}
                    className="bg-primary-600 text-white px-4 py-2 rounded-md flex items-center gap-2 hover:bg-primary-700 transition-colors"
                >
                    <Plus size={18} /> Nuevo Crédito
                </button>
            </div>

            <div className="flex gap-2">
                <FilterChip label="Todos" active={filter === 'all'} onClick={() => setFilter('all')} />
                <FilterChip label="Cobro hoy" active={filter === 'dueToday'} onClick={() => setFilter('dueToday')} />
                <FilterChip label="En mora" active={filter === 'overdue'} onClick={() => setFilter('overdue')} />
            </div>

            <div className="bg-white rounded-lg shadow-sm border border-gray-200">
                <div className="overflow-x-auto">
                    <table className="w-full text-left">
                        <thead className="bg-gray-50 text-xs uppercase text-gray-500">
                            <tr>
                                <th className="px-4 py-3">Cliente</th>
                                <th className="px-4 py-3">Monto</th>
                                <th className="px-4 py-3">Saldo</th>
                                <th className="px-4 py-3">Estado</th>
                                <th className="px-4 py-3">Próximo venc.</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y">
                            {isLoading && (
                                <tr>
                                    <td colSpan={5} className="px-4 py-6 text-center text-gray-500">
                                        Cargando...
                                    </td>
                                </tr>
                            )}
                            {!isLoading && credits?.length === 0 && (
                                <tr>
                                    <td colSpan={5} className="px-4 py-6 text-center text-gray-500">
                                        No hay créditos registrados
                                    </td>
                                </tr>
                            )}
                            {credits?.map((credit) => {
                                const nextDue = credit.paymentSchedule
                                    ? credit.paymentSchedule.find((p: any) => p.status !== 'paid')
                                    : null;
                                return (
                                    <tr
                                        key={credit.id}
                                        className="hover:bg-gray-50 cursor-pointer"
                                        onClick={() => navigate(`/credits/${credit.id}`)}
                                    >
                                        <td className="px-4 py-3">
                                            <div className="font-medium text-gray-900">{credit.client?.fullName || credit.clientId}</div>
                                            <div className="text-xs text-gray-500">{credit.client?.phone}</div>
                                        </td>
                                        <td className="px-4 py-3 text-gray-700">${Number(credit.amount).toLocaleString('es-CO', { maximumFractionDigits: 0 })}</td>
                                        <td className="px-4 py-3 text-gray-700">${Number(credit.remainingBalance).toLocaleString('es-CO', { maximumFractionDigits: 0 })}</td>
                                        <td className="px-4 py-3">
                                            <span className="px-2 py-1 rounded-full text-xs bg-gray-100 text-gray-700">
                                                {credit.status}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3 text-gray-700">
                                            {nextDue ? new Date((nextDue as any).dueDate).toLocaleDateString() : '-'}
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
                />
            )}
        </div>
    );
}

function FilterChip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
    return (
        <button
            onClick={onClick}
            className={`px-3 py-1 rounded-full text-sm border ${active ? 'bg-primary-600 text-white border-primary-600' : 'text-gray-700 border-gray-300 hover:bg-gray-100'
                }`}
        >
            {label}
        </button>
    );
}
