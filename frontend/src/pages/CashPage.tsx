import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getCashFlow, injectCapital, withdrawFunds, forecastCash, transferFunds } from '../api/cash.api';
import { getBusinesses } from '../api/business.api';
import { useAuthStore } from '../store/authStore';
import { useBusinessStore } from '../store/businessStore';
import { DollarSign, TrendingUp, TrendingDown, Activity, Filter, Plus, Minus, ArrowRightLeft, Wallet, Building2, X } from 'lucide-react';

const formatMoney = (val: any) => `$${Math.ceil(Number(val || 0)).toLocaleString('es-CO')}`;

export default function CashPage() {
    const { user } = useAuthStore();
    const isAdmin = ['admin', 'super_admin'].includes(user?.role || '');
    const { selectedBusinessId: businessId, setSelectedBusiness } = useBusinessStore();
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [activeTab, setActiveTab] = useState<'movements' | 'summary' | 'ops'>('movements');
    const [targetDate, setTargetDate] = useState('');
    const [isTransferModalOpen, setIsTransferModalOpen] = useState(false);

    const { data: businesses } = useQuery({
        queryKey: ['businesses'],
        queryFn: getBusinesses,
        enabled: isAdmin,
    });

    const { data: flow, isLoading } = useQuery({
        queryKey: ['cashFlow', businessId, startDate, endDate],
        queryFn: () => getCashFlow({ businessId: businessId!, startDate, endDate }),
        enabled: !!businessId,
    });

    const movements = flow?.movements || [];

    const balances = flow?.balances || { total: 0, cash: 0, bank: 0 };

    // Autoselect first business for admin
    useEffect(() => {
        if (isAdmin && businesses && businesses.length > 0 && !businessId) {
            setSelectedBusiness(businesses[0].id, businesses[0].name);
        }
        if (!isAdmin && !businessId && businesses && businesses.length > 0) {
            setSelectedBusiness(businesses[0].id, businesses[0].name);
        }
    }, [isAdmin, businesses, businessId, setSelectedBusiness]);

    const { data: forecast } = useQuery({
        queryKey: ['cashForecast', businessId, targetDate],
        queryFn: () => forecastCash({ businessId: businessId!, targetDate }),
        enabled: !!businessId && !!targetDate,
    });

    return (
        <div className="space-y-6">
            <header className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <div className="flex items-center gap-3">
                    <div className="p-3 rounded-xl bg-primary-500 text-white shadow-lg shadow-primary-200">
                        <DollarSign size={24} />
                    </div>
                    <div>
                        <h1 className="text-2xl font-bold text-gray-900">Caja</h1>
                        <p className="text-sm text-gray-500 font-medium whitespace-nowrap overflow-hidden text-ellipsis max-w-[200px] md:max-w-none">Administra el flujo de efectivo del negocio</p>
                    </div>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                    <div className="flex items-center gap-2 bg-white px-3 py-2 rounded-lg border border-gray-200 shadow-sm">
                        <Filter size={16} className="text-gray-400" />
                        {isAdmin && (
                            <select
                                value={businessId}
                                onChange={(e) => {
                                    const id = e.target.value;
                                    const name = id ? businesses?.find(b => b.id === id)?.name || '' : 'Seleccione negocio';
                                    setSelectedBusiness(id, name);
                                }}
                                className="bg-transparent border-none focus:ring-0 text-sm font-medium text-gray-700 p-0 pr-8"
                            >
                                <option value="">Negocios</option>
                                {businesses?.map((b) => (
                                    <option key={b.id} value={b.id}>{b.name}</option>
                                ))}
                            </select>
                        )}
                        <input
                            type="date"
                            value={startDate}
                            onChange={(e) => setStartDate(e.target.value)}
                            className="bg-transparent border-none focus:ring-0 text-sm text-gray-700 p-0 w-32"
                        />
                        <span className="text-gray-300">|</span>
                        <input
                            type="date"
                            value={endDate}
                            onChange={(e) => setEndDate(e.target.value)}
                            className="bg-transparent border-none focus:ring-0 text-sm text-gray-700 p-0 w-32"
                        />
                    </div>
                    {isAdmin && (
                        <button
                            onClick={() => setIsTransferModalOpen(true)}
                            className="flex items-center gap-2 px-4 py-2 bg-white text-primary-700 border border-primary-100 rounded-lg font-medium hover:bg-primary-50 transition-all shadow-sm"
                        >
                            <ArrowRightLeft size={18} />
                            Cambiar dinero de cuenta
                        </button>
                    )}
                </div>
            </header>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <SummaryCard title="Saldo Total" value={formatMoney(balances.total)} icon={<DollarSign size={20} />} variant="primary" isLoading={isLoading} />
                <SummaryCard title="En Efectivo" value={formatMoney(balances.cash)} icon={<Wallet size={20} />} variant="success" isLoading={isLoading} />
                <SummaryCard title="En Bancos/Otros" value={formatMoney(balances.bank)} icon={<Building2 size={20} />} variant="warning" isLoading={isLoading} />
            </div>

            <div className="flex gap-1 bg-gray-100 p-1 rounded-xl w-fit">
                <TabItem label="Movimientos" active={activeTab === 'movements'} onClick={() => setActiveTab('movements')} />
                <TabItem label="Proyección" active={activeTab === 'summary'} onClick={() => setActiveTab('summary')} />
                {isAdmin && (
                    <TabItem label="Operaciones" active={activeTab === 'ops'} onClick={() => setActiveTab('ops')} />
                )}
            </div>

            {activeTab === 'summary' && (
                <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
                    <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between mb-8">
                        <div>
                            <h2 className="text-lg font-bold text-gray-900">Proyección de caja</h2>
                            <p className="text-sm text-gray-500">Calcula el saldo futuro basado en cuotas pendientes</p>
                        </div>
                        <div className="flex items-center gap-3">
                            <span className="text-sm font-medium text-gray-600">Simular a fecha:</span>
                            <input
                                type="date"
                                value={targetDate}
                                onChange={(e) => setTargetDate(e.target.value)}
                                className="px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm"
                            />
                        </div>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                        <div className="space-y-6">
                            <div className="p-4 bg-primary-50 border border-primary-100 rounded-xl">
                                <p className="text-sm text-primary-700 font-medium">Resultado Proyectado</p>
                                <p className="text-3xl font-bold text-primary-900 mt-1">
                                    {forecast ? formatMoney(forecast.projectedBalance) : '-'}
                                </p>
                            </div>
                            <div className="flex justify-between items-center p-4 border border-gray-100 rounded-xl">
                                <span className="text-sm text-gray-600 font-medium">Saldo actual del negocio</span>
                                <span className="text-sm font-bold text-gray-900">{forecast ? formatMoney(forecast.currentBalance) : '-'}</span>
                            </div>
                            <div className="flex justify-between items-center p-4 border border-gray-100 rounded-xl">
                                <span className="text-sm text-gray-600 font-medium">Ingreso esperado (cuotas)</span>
                                <span className="text-sm font-bold text-green-600">+{forecast ? formatMoney(forecast.expectedIncome) : '-'}</span>
                            </div>
                        </div>
                        <div className="bg-slate-50 rounded-xl p-6 flex flex-col justify-center border border-slate-100">
                            <div className="flex items-center gap-2 text-primary-900 font-bold mb-2">
                                <Activity size={18} />
                                Nota Técnica
                            </div>
                            <p className="text-sm text-gray-600 leading-relaxed">
                                Esta proyección considera todas las cuotas marcadas como 'Pendiente' o 'Parcial' cuya fecha de vencimiento sea anterior o igual a la fecha seleccionada. Los valores no incluyen posibles moras o intereses adicionales generados.
                            </p>
                        </div>
                    </div>
                </div>
            )}

            {activeTab === 'movements' && (
                <MovementsTable movements={movements} isLoading={isLoading} />
            )}

            {activeTab === 'ops' && isAdmin && businessId && (
                <Operations businessId={businessId} />
            )}

            {isTransferModalOpen && businessId && (
                <TransferModal
                    businessId={businessId}
                    onClose={() => setIsTransferModalOpen(false)}
                    onSuccess={() => {
                        setIsTransferModalOpen(false);
                    }}
                />
            )}
        </div>
    );
}

function SummaryCard({ title, value, icon, variant, isLoading }: { title: string; value: string; icon: React.ReactNode; variant: 'primary' | 'success' | 'warning'; isLoading: boolean }) {
    const variants = {
        primary: 'bg-primary-50 border-primary-100 text-primary-700',
        success: 'bg-emerald-50 border-emerald-100 text-emerald-700',
        warning: 'bg-amber-50 border-amber-100 text-amber-700'
    };
    return (
        <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm transition-all hover:shadow-md">
            <div className={`p-2 rounded-lg w-fit ${variants[variant]}`}>
                {icon}
            </div>
            <p className="text-sm font-medium text-gray-500 mt-4">{title}</p>
            <p className="text-2xl font-bold text-gray-900 mt-1">{isLoading ? '...' : value}</p>
        </div>
    );
}

function TabItem({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
    return (
        <button
            onClick={onClick}
            className={`px-6 py-2 rounded-lg text-sm font-semibold transition-all ${active ? 'bg-white text-primary-600 shadow-sm' : 'text-gray-500 hover:text-primary-400'}`}
        >
            {label}
        </button>
    );
}

function MovementsTable({ movements, isLoading }: { movements: any[]; isLoading: boolean }) {
    const typeColor = (type: string, amount: number) => {
        if (type === 'internal_transfer') return amount > 0 ? 'text-emerald-600' : 'text-rose-600';
        const income = ['payment_received', 'capital_injection', 'interest_earned'].includes(type);
        return income ? 'text-emerald-600 font-medium' : 'text-rose-600 font-medium';
    };

    const getIcon = (type: string) => {
        if (type === 'internal_transfer') return <ArrowRightLeft size={16} />;
        const income = ['payment_received', 'capital_injection', 'interest_earned'].includes(type);
        return income ? <TrendingUp size={16} /> : <TrendingDown size={16} />;
    };

    return (
        <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
            <div className="p-4 border-b border-gray-100 bg-gray-50/50 flex justify-between items-center">
                <h3 className="text-sm font-bold text-gray-800">Flujo de Movimientos</h3>
                <span className="text-xs font-medium text-gray-500 bg-white px-2 py-1 rounded-md border border-gray-200">{movements.length} registros</span>
            </div>
            <div className="overflow-x-auto">
                <table className="w-full text-left text-sm whitespace-nowrap">
                    <thead className="bg-white text-gray-400 font-medium">
                        <tr>
                            <th className="px-6 py-4">Fecha</th>
                            <th className="px-6 py-4">Tipo / Canal</th>
                            <th className="px-6 py-4">Descripción</th>
                            <th className="px-6 py-4">Monto</th>
                            <th className="px-6 py-4">Saldo Final</th>
                            <th className="px-6 py-4">Usuario</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                        {isLoading && (
                            <tr><td className="px-6 py-12 text-center text-primary-600 font-medium" colSpan={6}>Detectando movimientos...</td></tr>
                        )}
                        {!isLoading && movements.length === 0 && (
                            <tr><td className="px-6 py-12 text-center text-gray-400" colSpan={6}>No se registran movimientos en el historial</td></tr>
                        )}
                        {movements.map((m) => {
                            const amt = Number(m.amount);
                            return (
                                <tr key={m.id} className="text-gray-700 hover:bg-gray-50 transition-colors">
                                    <td className="px-6 py-4 text-xs">
                                        <div className="font-semibold text-gray-900">{new Date(m.createdAt).toLocaleDateString()}</div>
                                        <div className="text-gray-400">{new Date(m.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
                                    </td>
                                    <td className="px-6 py-4">
                                        <div className={`flex items-center gap-2 text-xs font-bold uppercase tracking-wider ${typeColor(m.type, amt)}`}>
                                            {getIcon(m.type)}
                                            {m.type.replace('_', ' ')}
                                        </div>
                                        <div className="text-[10px] mt-0.5 text-gray-400 font-bold uppercase tracking-widest">{m.paymentMethod || 'EFECTIVO'}</div>
                                    </td>
                                    <td className="px-6 py-4 max-w-[200px] overflow-hidden text-ellipsis text-gray-600">{m.description || '-'}</td>
                                    <td className={`px-6 py-4 font-bold ${amt > 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                                        {amt > 0 ? '+' : ''}{formatMoney(amt)}
                                    </td>
                                    <td className="px-6 py-4 font-medium text-gray-900">{formatMoney(m.balanceAfter)}</td>
                                    <td className="px-6 py-4 text-xs font-medium text-gray-500">{m.createdBy?.fullName || '-'}</td>
                                </tr>
                            );
                        })}
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
        <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
            <h3 className="text-lg font-bold text-gray-900 mb-6 flex items-center gap-2">
                <Activity size={20} className="text-primary-500" />
                Nueva Operación Manual
            </h3>
            <div className="flex gap-2 p-1 bg-gray-100 rounded-lg w-fit mb-6">
                <button
                    onClick={() => setType('capital_injection')}
                    className={`flex items-center gap-2 px-6 py-2 rounded-md text-sm font-bold transition-all ${type === 'capital_injection' ? 'bg-white text-emerald-600 shadow-sm' : 'text-gray-500 hover:text-emerald-400'}`}
                >
                    <Plus size={16} /> Ingresar
                </button>
                <button
                    onClick={() => setType('withdrawal')}
                    className={`flex items-center gap-2 px-6 py-2 rounded-md text-sm font-bold transition-all ${type === 'withdrawal' ? 'bg-white text-rose-600 shadow-sm' : 'text-gray-500 hover:text-rose-400'}`}
                >
                    <Minus size={16} /> Retirar
                </button>
            </div>
            <form
                className="space-y-6"
                onSubmit={(e) => {
                    e.preventDefault();
                    mutation.mutate({
                        businessId,
                        amount: Number(amount.replace(/[^0-9]/g, '')),
                        description,
                    });
                }}
            >
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-1.5">
                        <label className="text-xs font-bold text-gray-600 uppercase tracking-wider">Monto</label>
                        <input
                            type="text"
                            placeholder="$0"
                            value={amount}
                            onChange={(e) => {
                                const raw = e.target.value.replace(/[^0-9]/g, '');
                                const formatted = raw ? Number(raw).toLocaleString('es-CO') : '';
                                setAmount(formatted);
                            }}
                            className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 text-lg font-bold transition-all"
                            required
                        />
                    </div>
                    <div className="space-y-1.5">
                        <label className="text-xs font-bold text-gray-600 uppercase tracking-wider">Descripción o Nota</label>
                        <input
                            type="text"
                            placeholder="Ej: Pago de arriendo, base del día..."
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 transition-all font-medium"
                            required
                            minLength={5}
                        />
                    </div>
                </div>
                <div className="flex items-center justify-between">
                    {mutation.error && (
                        <p className="text-sm font-bold text-rose-600 bg-rose-50 px-3 py-2 rounded-lg">
                            {(mutation.error as any).response?.data?.error || 'Error en la operación'}
                        </p>
                    )}
                    <button
                        type="submit"
                        disabled={mutation.isPending}
                        className={`ml-auto px-8 py-3 rounded-xl font-bold text-white transition-all shadow-lg ${type === 'capital_injection' ? 'bg-emerald-500 hover:bg-emerald-600 shadow-emerald-200' : 'bg-rose-500 hover:bg-rose-600 shadow-rose-200'} disabled:opacity-50`}
                    >
                        {mutation.isPending ? 'Procesando...' : 'Confirmar Registro'}
                    </button>
                </div>
            </form>
        </div>
    );
}

function TransferModal({ businessId, onClose, onSuccess }: { businessId: string; onClose: () => void; onSuccess: () => void }) {
    const queryClient = useQueryClient();
    const [amount, setAmount] = useState('');
    const [fromMethod, setFromMethod] = useState('efectivo');
    const [toMethod, setToMethod] = useState('transferencia');
    const [description, setDescription] = useState('');

    const mutation = useMutation({
        mutationFn: transferFunds,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['cashFlow'] });
            onSuccess();
        },
    });

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        mutation.mutate({
            businessId,
            amount: Number(amount.replace(/[^0-9]/g, '')),
            fromMethod,
            toMethod,
            description
        });
    };

    return (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200">
                <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-slate-50">
                    <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                        <ArrowRightLeft className="text-primary-600" size={20} />
                        Transferencia Interna
                    </h3>
                    <button onClick={onClose} className="p-2 hover:bg-white hover:shadow-sm rounded-lg transition-all">
                        <X size={18} className="text-gray-400" />
                    </button>
                </div>
                <form onSubmit={handleSubmit} className="p-6 space-y-6">
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1.5">
                            <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">Origen</label>
                            <select
                                value={fromMethod}
                                onChange={(e) => setFromMethod(e.target.value)}
                                className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-primary-500 outline-none text-sm font-bold"
                            >
                                <option value="efectivo">💳 Efectivo</option>
                                <option value="transferencia">🏦 Banco/Transf.</option>
                            </select>
                        </div>
                        <div className="space-y-1.5 text-right">
                            <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">Destino</label>
                            <select
                                value={toMethod}
                                onChange={(e) => setToMethod(e.target.value)}
                                className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-primary-500 outline-none text-sm font-bold"
                            >
                                <option value="efectivo">💳 Efectivo</option>
                                <option value="transferencia">🏦 Banco/Transf.</option>
                            </select>
                        </div>
                    </div>

                    <div className="space-y-1.5">
                        <label className="text-xs font-bold text-gray-500 uppercase tracking-wider text-center block">Monto a mover</label>
                        <input
                            type="text"
                            placeholder="$0"
                            value={amount}
                            onChange={(e) => {
                                const raw = e.target.value.replace(/[^0-9]/g, '');
                                setAmount(raw ? Number(raw).toLocaleString('es-CO') : '');
                            }}
                            className="w-full px-4 py-4 bg-primary-50 border border-primary-100 rounded-2xl focus:outline-none focus:ring-2 focus:ring-primary-500 text-3xl font-bold text-center text-primary-900 transition-all"
                            required
                        />
                    </div>

                    <div className="space-y-1.5">
                        <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">Notas adicionales</label>
                        <textarea
                            rows={2}
                            placeholder="Ej: Cambio de efectivo a cuenta Bancolombia..."
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 transition-all text-sm font-medium resize-none"
                        />
                    </div>

                    {fromMethod === toMethod && (
                        <p className="text-xs font-bold text-amber-600 bg-amber-50 p-2 rounded-lg text-center">
                            ⚠️ El origen y el destino no pueden ser el mismo
                        </p>
                    )}

                    <div className="flex gap-3 pt-2">
                        <button
                            type="button"
                            onClick={onClose}
                            className="flex-1 px-4 py-3 border border-gray-200 text-gray-600 rounded-xl font-bold hover:bg-gray-50 transition-all"
                        >
                            Cancelar
                        </button>
                        <button
                            type="submit"
                            disabled={mutation.isPending || fromMethod === toMethod || !amount}
                            className="flex-1 px-4 py-3 bg-primary-600 text-white rounded-xl font-bold hover:bg-primary-700 shadow-lg shadow-primary-200 disabled:opacity-50 transition-all"
                        >
                            {mutation.isPending ? 'Procesando...' : 'Confirmar'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
