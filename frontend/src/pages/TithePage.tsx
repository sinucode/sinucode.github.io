import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Church, CheckCircle2, Clock, AlertCircle, ExternalLink } from 'lucide-react';
import { useAuthStore } from '../store/authStore';
import { useBusinessStore } from '../store/businessStore';
import { getBusinesses } from '../api/business.api';
import { getTitheSummary, payTithe, TitheCreditItem } from '../api/tithe.api';
import { invalidateMoney } from '../utils/invalidate';

const formatMoney = (val: any) => `$${Math.ceil(Number(val || 0)).toLocaleString('es-CO')}`;
const formatDate = (d: string | null) => d ? new Date(d).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

export default function TithePage() {
    const { user } = useAuthStore();
    const navigate = useNavigate();
    const queryClient = useQueryClient();
    const { selectedBusinessId: businessId, setSelectedBusiness } = useBusinessStore();

    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [tab, setTab] = useState<'pendiente' | 'pagado'>('pendiente');
    const [error, setError] = useState('');

    // Solo super_admin
    if (user?.role !== 'super_admin') {
        return (
            <div className="flex flex-col items-center justify-center py-20 text-center">
                <AlertCircle className="text-amber-500 mb-3" size={40} />
                <h2 className="text-xl font-bold text-gray-800">Acceso restringido</h2>
                <p className="text-gray-600 mt-1">El módulo de diezmo es exclusivo del Super Administrador.</p>
            </div>
        );
    }

    const { data: businesses } = useQuery({ queryKey: ['businesses'], queryFn: getBusinesses });

    const { data: summary, isLoading } = useQuery({
        queryKey: ['tithe', businessId],
        queryFn: () => getTitheSummary(businessId),
        enabled: !!businessId,
    });

    const pendientes = useMemo(() => summary?.items.filter(i => !i.tithePaid) || [], [summary]);
    const pagados = useMemo(() => summary?.items.filter(i => i.tithePaid) || [], [summary]);
    const visibles = tab === 'pendiente' ? pendientes : pagados;

    const selectedItems = pendientes.filter(i => selectedIds.has(i.creditId));
    const selectedTithe = selectedItems.reduce((s, i) => s + i.tithe, 0);
    const selectedProfit = selectedItems.reduce((s, i) => s + i.rentabilidad, 0);

    const payMutation = useMutation({
        mutationFn: () => payTithe(businessId, Array.from(selectedIds)),
        onSuccess: (res) => {
            invalidateMoney(queryClient);
            setSelectedIds(new Set());
            setError('');
            alert(`Diezmo pagado: ${formatMoney(res.titheAmount)} sobre rentabilidad de ${formatMoney(res.totalProfit)} (${res.creditsPaid} créditos). Nuevo saldo en caja: ${formatMoney(res.newBalance)}`);
        },
        onError: (err: any) => setError(err?.response?.data?.error || 'Error al pagar el diezmo'),
    });

    const toggle = (id: string) => {
        setSelectedIds(prev => {
            const next = new Set(prev);
            next.has(id) ? next.delete(id) : next.add(id);
            return next;
        });
    };
    const toggleAll = () => {
        if (selectedIds.size === pendientes.length) setSelectedIds(new Set());
        else setSelectedIds(new Set(pendientes.map(i => i.creditId)));
    };

    const handlePay = () => {
        if (selectedIds.size === 0) return setError('Selecciona al menos un crédito');
        const ok = window.confirm(
            `¿Confirmas pagar el diezmo de ${formatMoney(selectedTithe)} (10% de ${formatMoney(selectedProfit)}) por ${selectedIds.size} crédito(s)?\n\nSe descontará de la caja del negocio.`
        );
        if (ok) payMutation.mutate();
    };

    return (
        <div className="space-y-5">
            {/* Header */}
            <header className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                <div className="flex items-center gap-3">
                    <div className="p-3 rounded-lg bg-amber-50 text-amber-700">
                        <Church size={24} />
                    </div>
                    <div>
                        <h1 className="text-2xl font-bold text-gray-800">Diezmo</h1>
                        <p className="text-sm text-gray-600">Calcula y paga el diezmo (10%) sobre la rentabilidad de los créditos</p>
                    </div>
                </div>
                <select
                    value={businessId}
                    onChange={(e) => {
                        const id = e.target.value;
                        const name = id ? businesses?.find(b => b.id === id)?.name || '' : '';
                        setSelectedBusiness(id, name);
                        setSelectedIds(new Set());
                    }}
                    className="px-3 py-2 border border-gray-300 rounded-md text-sm"
                >
                    <option value="">Selecciona un negocio</option>
                    {businesses?.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
            </header>

            {!businessId ? (
                <div className="bg-white rounded-xl border border-gray-200 p-10 text-center text-gray-500">
                    Selecciona un negocio para calcular su diezmo.
                </div>
            ) : isLoading ? (
                <div className="bg-white rounded-xl border border-gray-200 p-10 text-center text-gray-500">Cargando...</div>
            ) : (
                <>
                    {/* KPIs */}
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                        <Kpi title="Rentabilidad total" value={formatMoney(summary?.totals.rentabilidadTotal)} color="gray" />
                        <Kpi title="Diezmo pendiente" value={formatMoney(summary?.totals.diezmoPendiente)} color="amber" subtitle={`${summary?.totals.countPendiente} créditos`} />
                        <Kpi title="Diezmo pagado" value={formatMoney(summary?.totals.diezmoPagado)} color="emerald" subtitle={`${summary?.totals.countPagado} créditos`} />
                        <Kpi title="Saldo en caja" value={formatMoney(summary?.business.currentBalance)} color="blue" />
                    </div>

                    {error && (
                        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-2 flex items-center gap-2">
                            <AlertCircle size={16} /> {error}
                        </div>
                    )}

                    {/* Tabs */}
                    <div className="flex items-center gap-2 border-b border-gray-200">
                        <TabButton active={tab === 'pendiente'} onClick={() => setTab('pendiente')} icon={<Clock size={15} />} label={`Pendiente de diezmo (${pendientes.length})`} />
                        <TabButton active={tab === 'pagado'} onClick={() => setTab('pagado')} icon={<CheckCircle2 size={15} />} label={`Diezmo pagado (${pagados.length})`} />
                    </div>

                    {/* Barra de acción (solo en pendientes) */}
                    {tab === 'pendiente' && pendientes.length > 0 && (
                        <div className="flex flex-wrap items-center justify-between gap-3 bg-amber-50 border border-amber-200 rounded-xl p-3">
                            <div className="text-sm text-amber-900">
                                {selectedIds.size > 0 ? (
                                    <span><b>{selectedIds.size}</b> seleccionados · Diezmo a pagar: <b>{formatMoney(selectedTithe)}</b> (10% de {formatMoney(selectedProfit)})</span>
                                ) : (
                                    <span>Selecciona créditos para calcular el diezmo</span>
                                )}
                            </div>
                            <button
                                onClick={handlePay}
                                disabled={selectedIds.size === 0 || payMutation.isPending}
                                className="px-4 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700 text-sm font-semibold disabled:opacity-50 flex items-center gap-2"
                            >
                                <Church size={16} />
                                {payMutation.isPending ? 'Procesando...' : `Pagar diezmo (${formatMoney(selectedTithe)})`}
                            </button>
                        </div>
                    )}

                    {/* Tabla */}
                    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead className="bg-gray-50 border-b border-gray-200">
                                    <tr>
                                        {tab === 'pendiente' && (
                                            <th className="px-3 py-2 text-left">
                                                <input type="checkbox" checked={pendientes.length > 0 && selectedIds.size === pendientes.length} onChange={toggleAll} />
                                            </th>
                                        )}
                                        <th className="px-3 py-2 text-left text-xs font-semibold text-gray-600 uppercase">Cliente</th>
                                        <th className="px-3 py-2 text-right text-xs font-semibold text-gray-600 uppercase">Capital</th>
                                        <th className="px-3 py-2 text-right text-xs font-semibold text-gray-600 uppercase">Cobrado</th>
                                        <th className="px-3 py-2 text-right text-xs font-semibold text-gray-600 uppercase">Rentabilidad</th>
                                        <th className="px-3 py-2 text-right text-xs font-semibold text-gray-600 uppercase">Diezmo 10%</th>
                                        <th className="px-3 py-2 text-left text-xs font-semibold text-gray-600 uppercase">{tab === 'pagado' ? 'Pagado el' : 'Completado'}</th>
                                        <th className="px-3 py-2"></th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                    {visibles.length === 0 ? (
                                        <tr><td colSpan={8} className="px-3 py-8 text-center text-gray-500">
                                            {tab === 'pendiente' ? 'No hay créditos con diezmo pendiente' : 'Aún no se ha pagado ningún diezmo'}
                                        </td></tr>
                                    ) : visibles.map((it: TitheCreditItem) => (
                                        <tr key={it.creditId} className="hover:bg-gray-50">
                                            {tab === 'pendiente' && (
                                                <td className="px-3 py-2">
                                                    <input type="checkbox" checked={selectedIds.has(it.creditId)} onChange={() => toggle(it.creditId)} />
                                                </td>
                                            )}
                                            <td className="px-3 py-2 font-medium text-gray-900">{it.clientName}</td>
                                            <td className="px-3 py-2 text-right text-gray-600">{formatMoney(it.capital)}</td>
                                            <td className="px-3 py-2 text-right text-gray-600">{formatMoney(it.totalPaid)}</td>
                                            <td className="px-3 py-2 text-right font-semibold text-gray-900">{formatMoney(it.rentabilidad)}</td>
                                            <td className="px-3 py-2 text-right font-bold text-amber-700">{formatMoney(it.tithe)}</td>
                                            <td className="px-3 py-2 text-gray-500 text-xs">{formatDate(tab === 'pagado' ? it.tithePaidAt : it.completionDate)}</td>
                                            <td className="px-3 py-2 text-right">
                                                <button onClick={() => navigate(`/credits/${it.creditId}`)} className="p-1.5 text-gray-400 hover:text-primary-600 hover:bg-primary-50 rounded" title="Ver crédito">
                                                    <ExternalLink size={15} />
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}

function Kpi({ title, value, color, subtitle }: { title: string; value: string; color: string; subtitle?: string }) {
    const colors: Record<string, string> = {
        gray: 'border-l-gray-500', amber: 'border-l-amber-500', emerald: 'border-l-emerald-500', blue: 'border-l-blue-500',
    };
    return (
        <div className={`bg-white rounded-xl border border-gray-200 border-l-4 ${colors[color]} p-3 shadow-sm`}>
            <p className="text-xs text-gray-500 uppercase tracking-wide font-medium">{title}</p>
            <p className="text-xl font-bold text-gray-900 mt-0.5">{value}</p>
            {subtitle && <p className="text-xs text-gray-500 mt-0.5">{subtitle}</p>}
        </div>
    );
}

function TabButton({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
    return (
        <button
            onClick={onClick}
            className={`flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 -mb-px transition ${active ? 'border-amber-600 text-amber-700' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
        >
            {icon} {label}
        </button>
    );
}
