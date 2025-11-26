import { useEffect, useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getCashFlow, injectCapital, withdrawFunds, forecastCash } from '../api/cash.api';
import { getBusinesses } from '../api/business.api';
import { useAuthStore } from '../store/authStore';
import { DollarSign, TrendingUp, TrendingDown, Activity, Filter, Plus, Minus } from 'lucide-react';

const formatMoney = (val: any) => `$${Math.ceil(Number(val || 0)).toLocaleString('es-CO')}`;

export default function CashPage() {
    const { user } = useAuthStore();
    const isAdmin = ['admin', 'super_admin'].includes(user?.role || '');
    const [businessId, setBusinessId] = useState<string>('');
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [activeTab, setActiveTab] = useState<'movements' | 'summary' | 'ops'>('movements');
    const [targetDate, setTargetDate] = useState('');

    const { data: businesses } = useQuery({
        queryKey: ['businesses'],
        queryFn: getBusinesses,
        enabled: isAdmin,
    });

    const { data: flow, isLoading } = useQuery({
        queryKey: ['cashFlow', businessId, startDate, endDate],
        queryFn: () => getCashFlow({ businessId, startDate, endDate }),
        enabled: !!businessId,
    });

    const movements = flow?.movements || [];
    const summary = flow?.summary || { totalIncome: 0, totalExpenses: 0, net: 0 };

    // Autoselect first business for admin
    useEffect(() => {
        if (isAdmin && businesses && businesses.length > 0 && !businessId) {
            setBusinessId(businesses[0].id);
        }
        if (!isAdmin && !businessId && businesses && businesses.length > 0) {
            setBusinessId(businesses[0].id);
        }
    }, [isAdmin, businesses, businessId]);

    const { data: forecast } = useQuery({
        queryKey: ['cashForecast', businessId, targetDate],
        queryFn: () => forecastCash({ businessId, targetDate }),
        enabled: !!businessId && !!targetDate,
    });

    return (
        <div className="space-y-4">
            <header className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                <div className="flex items-center gap-3">
                    <div className="p-3 rounded-lg bg-primary-50 text-primary-700">
                        <DollarSign size={24} />
                    </div>
                    <div>
                        <h1 className="text-2xl font-bold text-gray-800">Caja</h1>
                        <p className="text-gray-600">Flujo de efectivo y operaciones de caja</p>
                    </div>
                </div>
                <div className="flex items-center gap-3 text-sm text-gray-700">
                    <Filter size={16} />
                    {isAdmin && (
                        <select
                            value={businessId}
                            onChange={(e) => setBusinessId(e.target.value)}
                            className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
                        >
                            <option value="">Seleccione negocio</option>
                            {businesses?.map((b) => (
                                <option key={b.id} value={b.id}>{b.name}</option>
                            ))}
                        </select>
                    )}
                    <input
                        type="date"
                        value={startDate}
                        onChange={(e) => setStartDate(e.target.value)}
                        className="px-3 py-2 border border-gray-300 rounded-md"
                    />
                    <input
                        type="date"
                        value={endDate}
                        onChange={(e) => setEndDate(e.target.value)}
                        className="px-3 py-2 border border-gray-300 rounded-md"
                    />
                </div>
            </header>

            <div className="flex gap-2 text-sm">
                <TabButton label="Movimientos" active={activeTab === 'movements'} onClick={() => setActiveTab('movements')} />
                <TabButton label="Resumen" active={activeTab === 'summary'} onClick={() => setActiveTab('summary')} />
                {isAdmin && (
                    <TabButton label="Operaciones" active={activeTab === 'ops'} onClick={() => setActiveTab('ops')} />
                )}
            </div>

            {activeTab === 'summary' && (
                <SummarySection summary={summary} isLoading={isLoading} forecast={forecast} targetDate={targetDate} onTargetDateChange={setTargetDate} />
            )}

            {activeTab === 'movements' && (
                <MovementsTable movements={movements} isLoading={isLoading} />
            )}

            {activeTab === 'ops' && isAdmin && businessId && (
                <Operations businessId={businessId} />
            )}
        </div>
    );
}

function TabButton({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
    return (
        <button
            onClick={onClick}
            className={`px-3 py-2 rounded-md border text-sm ${active ? 'bg-primary-600 text-white border-primary-600' : 'bg-white text-gray-700 border-gray-300'}`}
        >
            {label}
        </button>
    );
}

function SummarySection({ summary, isLoading, forecast, targetDate, onTargetDateChange }: { summary: any; isLoading: boolean; forecast?: any; targetDate: string; onTargetDateChange: (d: string) => void }) {
    const cards = [
        { title: 'Ingresos', value: formatMoney(summary.totalIncome), icon: <TrendingUp size={18} className="text-green-600" /> },
        { title: 'Egresos', value: formatMoney(summary.totalExpenses), icon: <TrendingDown size={18} className="text-red-600" /> },
        { title: 'Flujo Neto', value: formatMoney(summary.net), icon: <Activity size={18} className="text-blue-600" /> },
    ];
    return (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {cards.map((c) => (
                <div key={c.title} className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm">
                    <div className="flex items-center gap-2 text-gray-700">
                        {c.icon}
                        <span className="text-sm">{c.title}</span>
                    </div>
                    <p className="text-xl font-semibold text-gray-900 mt-2">{isLoading ? '...' : c.value}</p>
                </div>
            ))}
            <div className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm col-span-1 md:col-span-3">
                <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                    <div>
                        <p className="text-sm text-gray-500">Proyección de caja</p>
                        <p className="text-lg font-semibold text-gray-800">
                            {forecast ? `Saldo proyectado: ${formatMoney(forecast.projectedBalance)}` : 'Seleccione fecha'}
                        </p>
                        {forecast && (
                            <p className="text-sm text-gray-600">
                                Saldo actual: {formatMoney(forecast.currentBalance)} | Ingreso esperado: {formatMoney(forecast.expectedIncome)}
                            </p>
                        )}
                    </div>
                    <input
                        type="date"
                        value={targetDate}
                        onChange={(e) => onTargetDateChange(e.target.value)}
                        className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
                    />
                </div>
            </div>
        </div>
    );
}

function MovementsTable({ movements, isLoading }: { movements: any[]; isLoading: boolean }) {
    const typeColor = (type: string) => {
        const income = ['payment_received', 'capital_injection', 'interest_earned'].includes(type);
        return income ? 'text-green-700' : 'text-red-700';
    };
    return (
        <div className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm">
            <h3 className="text-sm font-semibold text-gray-700 mb-3">Movimientos recientes</h3>
            <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                    <thead className="bg-gray-50 text-gray-600">
                        <tr>
                            <th className="px-3 py-2">Fecha</th>
                            <th className="px-3 py-2">Tipo</th>
                            <th className="px-3 py-2">Descripción</th>
                            <th className="px-3 py-2">Monto</th>
                            <th className="px-3 py-2">Saldo después</th>
                            <th className="px-3 py-2">Usuario</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y">
                        {isLoading && (
                            <tr><td className="px-3 py-3 text-gray-500" colSpan={6}>Cargando...</td></tr>
                        )}
                        {!isLoading && movements.length === 0 && (
                            <tr><td className="px-3 py-3 text-gray-500" colSpan={6}>Sin movimientos en el período</td></tr>
                        )}
                        {movements.map((m) => (
                            <tr key={m.id} className="text-gray-800">
                                <td className="px-3 py-2">{new Date(m.createdAt).toLocaleString()}</td>
                                <td className={`px-3 py-2 capitalize ${typeColor(m.type)}`}>{m.type.replace('_', ' ')}</td>
                                <td className="px-3 py-2">{m.description || '-'}</td>
                                <td className="px-3 py-2">{formatMoney(m.amount)}</td>
                                <td className="px-3 py-2">{formatMoney(m.balanceAfter)}</td>
                                <td className="px-3 py-2">{m.createdBy?.fullName || '-'}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

function Operations({ businessId }: { businessId: string }) {
    const queryClient = useQueryClient();
    const [amount, setAmount] = useState('');
    const [description, setDescription] = useState('');
    const [type, setType] = useState<'capital_injection' | 'withdrawal'>('capital_injection');

    const mutation = useMutation({
        mutationFn: (payload: any) => type === 'capital_injection' ? injectCapital(payload) : withdrawFunds(payload),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['cashFlow'] });
            setAmount('');
            setDescription('');
        },
    });

    return (
        <div className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm">
            <h3 className="text-sm font-semibold text-gray-700 mb-3">Operaciones de caja</h3>
            <div className="flex gap-3 mb-3">
                <button
                    onClick={() => setType('capital_injection')}
                    className={`px-3 py-2 rounded-md text-sm border ${type === 'capital_injection' ? 'bg-green-50 border-green-500 text-green-700' : 'bg-white border-gray-300 text-gray-700'}`}
                >
                    <Plus size={14} className="inline mr-1" /> Inyectar capital
                </button>
                <button
                    onClick={() => setType('withdrawal')}
                    className={`px-3 py-2 rounded-md text-sm border ${type === 'withdrawal' ? 'bg-red-50 border-red-500 text-red-700' : 'bg-white border-gray-300 text-gray-700'}`}
                >
                    <Minus size={14} className="inline mr-1" /> Retirar fondos
                </button>
            </div>
            <form
                className="space-y-3"
                onSubmit={(e) => {
                    e.preventDefault();
                    mutation.mutate({
                        businessId,
                        amount: Number(amount.replace(/[^0-9]/g, '')),
                        description,
                    });
                }}
            >
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                        <label className="text-sm text-gray-700">Monto</label>
                        <input
                            type="text"
                            value={amount}
                            onChange={(e) => {
                                const raw = e.target.value.replace(/[^0-9]/g, '');
                                const formatted = raw ? Number(raw).toLocaleString('es-CO') : '';
                                setAmount(formatted);
                            }}
                            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
                            required
                        />
                    </div>
                    <div>
                        <label className="text-sm text-gray-700">Descripción</label>
                        <input
                            type="text"
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
                            required
                            minLength={5}
                        />
                    </div>
                </div>
                <button
                    type="submit"
                    className="px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700 text-sm"
                    disabled={mutation.isPending}
                >
                    {mutation.isPending ? 'Guardando...' : 'Registrar'}
                </button>
                {mutation.error && (
                    <p className="text-sm text-red-600">
                        {(mutation.error as any).response?.data?.error || 'Error al registrar movimiento'}
                    </p>
                )}
            </form>
        </div>
    );
}
