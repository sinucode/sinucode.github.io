import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Lock, Unlock, Clock, AlertCircle, RotateCcw } from 'lucide-react';
import { getAccountBalances, getTodayClose, listCloses, createClose, reopenClose } from '../../api/accounts.api';
import { useAuthStore } from '../../store/authStore';
import { invalidateMoney } from '../../utils/invalidate';

const formatMoney = (v: any) => `$${Math.ceil(Number(v || 0)).toLocaleString('es-CO')}`;
const formatDate = (d?: string | null) => d ? new Date(d).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
const formatDateTime = (d?: string | null) => d ? new Date(d).toLocaleString('es-CO', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—';

export default function CashCloseTab({ businessId }: { businessId: string }) {
    const { user } = useAuthStore();
    const queryClient = useQueryClient();
    const isAdmin = ['admin', 'super_admin'].includes(user?.role || '');
    const isSuper = user?.role === 'super_admin';
    const [error, setError] = useState('');

    const { data: balData } = useQuery({ queryKey: ['account-balances', businessId], queryFn: () => getAccountBalances(businessId), enabled: !!businessId });
    const { data: today } = useQuery({ queryKey: ['close-today', businessId], queryFn: () => getTodayClose(businessId), enabled: !!businessId });
    const { data: history } = useQuery({ queryKey: ['close-history', businessId], queryFn: () => listCloses(businessId), enabled: !!businessId });

    const accounts = balData?.accounts || [];
    const isClosed = today?.status === 'closed';

    const refresh = () => {
        invalidateMoney(queryClient);
        queryClient.invalidateQueries({ queryKey: ['close-today'] });
        queryClient.invalidateQueries({ queryKey: ['close-history'] });
    };

    const closeMut = useMutation({
        mutationFn: () => createClose({ businessId }),
        onSuccess: () => { setError(''); refresh(); },
        onError: (e: any) => setError(e?.response?.data?.error || 'No se pudo cerrar la caja'),
    });

    const reopenMut = useMutation({
        mutationFn: (closeId: string) => {
            const reason = window.prompt('Motivo de la reapertura:') || '';
            if (!reason.trim()) throw new Error('cancelado');
            return reopenClose(closeId, reason);
        },
        onSuccess: () => { setError(''); refresh(); },
        onError: (e: any) => { if (e?.message !== 'cancelado') setError(e?.response?.data?.error || 'No se pudo reabrir'); },
    });

    return (
        <div className="space-y-5">
            {error && (
                <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-2 flex items-center gap-2">
                    <AlertCircle size={16} /> {error}
                </div>
            )}

            {/* Estado de hoy */}
            <div className={`rounded-xl border p-5 ${isClosed ? 'bg-rose-50 border-rose-200' : 'bg-emerald-50 border-emerald-200'}`}>
                <div className="flex items-center justify-between flex-wrap gap-3">
                    <div className="flex items-center gap-3">
                        <div className={`p-2.5 rounded-lg ${isClosed ? 'bg-rose-100 text-rose-700' : 'bg-emerald-100 text-emerald-700'}`}>
                            {isClosed ? <Lock size={20} /> : <Unlock size={20} />}
                        </div>
                        <div>
                            <p className="font-bold text-gray-900">
                                Hoy: {isClosed ? 'Caja CERRADA' : today?.status === 'reopened' ? 'Caja REABIERTA' : 'Caja ABIERTA'}
                            </p>
                            <p className="text-xs text-gray-600">
                                {today
                                    ? `${today.closeMode === 'auto' ? 'Cierre automático' : 'Cierre manual'} · ${formatDateTime(today.closedAt)}${today.status === 'reopened' ? ` · reabierto ${formatDateTime(today.reopenedAt)}` : ''}`
                                    : 'Aún no se ha cerrado la caja de hoy.'}
                            </p>
                        </div>
                    </div>
                    <div className="flex gap-2">
                        {isAdmin && !isClosed && (
                            <button onClick={() => closeMut.mutate()} disabled={closeMut.isPending} className="flex items-center gap-2 px-4 py-2 bg-rose-600 text-white rounded-lg font-semibold text-sm hover:bg-rose-700 disabled:opacity-50">
                                <Lock size={16} /> {closeMut.isPending ? 'Cerrando...' : 'Cerrar caja'}
                            </button>
                        )}
                        {isSuper && isClosed && today && (
                            <button onClick={() => reopenMut.mutate(today.id)} disabled={reopenMut.isPending} className="flex items-center gap-2 px-4 py-2 bg-amber-500 text-white rounded-lg font-semibold text-sm hover:bg-amber-600 disabled:opacity-50">
                                <RotateCcw size={16} /> Reabrir
                            </button>
                        )}
                    </div>
                </div>
            </div>

            {/* Saldo por cuenta al día de hoy */}
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                <div className="px-4 py-3 border-b border-gray-100 bg-gray-50/50 text-sm font-bold text-gray-800">Saldo actual por cuenta (lo que debe haber hoy)</div>
                <table className="w-full text-sm">
                    <tbody className="divide-y divide-gray-100">
                        {accounts.map((a) => (
                            <tr key={a.id}>
                                <td className="px-4 py-2.5 font-medium text-gray-800">{a.name}</td>
                                <td className="px-4 py-2.5 text-right font-bold text-gray-900">{formatMoney(a.balance)}</td>
                            </tr>
                        ))}
                        <tr className="bg-gray-50">
                            <td className="px-4 py-2.5 font-bold text-gray-900">Total</td>
                            <td className="px-4 py-2.5 text-right font-bold text-primary-700">{formatMoney(balData?.total)}</td>
                        </tr>
                    </tbody>
                </table>
            </div>

            {/* Historial de cierres */}
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                <div className="px-4 py-3 border-b border-gray-100 bg-gray-50/50 text-sm font-bold text-gray-800 flex items-center gap-2">
                    <Clock size={15} /> Historial de cierres
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead className="bg-white text-gray-500">
                            <tr>
                                <th className="px-4 py-2 text-left text-xs font-semibold uppercase">Fecha</th>
                                <th className="px-4 py-2 text-left text-xs font-semibold uppercase">Estado</th>
                                <th className="px-4 py-2 text-left text-xs font-semibold uppercase">Modo</th>
                                <th className="px-4 py-2 text-right text-xs font-semibold uppercase">Total</th>
                                <th className="px-4 py-2"></th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {(!history || history.length === 0) ? (
                                <tr><td colSpan={5} className="px-4 py-6 text-center text-gray-400">Sin cierres registrados</td></tr>
                            ) : history.map((c) => (
                                <tr key={c.id} className="hover:bg-gray-50">
                                    <td className="px-4 py-2.5 text-gray-700">{formatDate(c.closeDate)}</td>
                                    <td className="px-4 py-2.5">
                                        <span className={`inline-block px-2 py-0.5 text-xs font-medium rounded border ${c.status === 'closed' ? 'bg-rose-50 text-rose-700 border-rose-200' : 'bg-amber-50 text-amber-700 border-amber-200'}`}>
                                            {c.status === 'closed' ? 'Cerrado' : 'Reabierto'}
                                        </span>
                                    </td>
                                    <td className="px-4 py-2.5 text-gray-500 text-xs capitalize">{c.closeMode === 'auto' ? 'Automático' : 'Manual'}</td>
                                    <td className="px-4 py-2.5 text-right font-semibold text-gray-900">{formatMoney(c.totalBalance)}</td>
                                    <td className="px-4 py-2.5 text-right">
                                        {isSuper && c.status === 'closed' && (
                                            <button onClick={() => reopenMut.mutate(c.id)} className="text-xs text-amber-600 hover:underline">Reabrir</button>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
