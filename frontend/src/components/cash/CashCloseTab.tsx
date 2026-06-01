import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
    Lock, Unlock, Clock, AlertCircle, RotateCcw,
    FileDown, FileSpreadsheet, ChevronDown, ChevronRight,
    TrendingUp, TrendingDown, DollarSign, Users, UserCheck,
} from 'lucide-react';
import {
    getTodayClose, listCloses, createClose, reopenClose, getCloseReport,
    type CloseReport,
} from '../../api/accounts.api';
import { useAuthStore } from '../../store/authStore';
import { invalidateMoney } from '../../utils/invalidate';
import { generateCloseReportPdf } from '../../utils/generateCloseReportPdf';
import { exportToCsv } from '../../utils/exportCsv';

const FM  = (v: any) => `$${Math.ceil(Number(v || 0)).toLocaleString('es-CO')}`;
const FDt = (d?: string | null) =>
    d ? new Date(d).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
const FDtTime = (d?: string | null) =>
    d ? new Date(d).toLocaleString('es-CO', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—';
const FHour = (d: string) =>
    new Date(d).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Bogota' });

const TYPE_LABELS: Record<string, string> = {
    capital_injection:   'Inyección capital',
    withdrawal:          'Retiro',
    internal_transfer:   'Transferencia',
    interest_earned:     'Interés/Donación',
    initial_capital:     'Capital inicial',
    expense:             'Gasto',
    loan_disbursement:   'Desembolso',
    credit_cancellation: 'Cancelación',
    tithe:               'Diezmo',
};

const todayBogota = () =>
    new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(new Date());

export default function CashCloseTab({ businessId }: { businessId: string }) {
    const { user } = useAuthStore();
    const queryClient = useQueryClient();
    const isAdmin = ['admin', 'super_admin'].includes(user?.role || '');
    const isSuper = user?.role === 'super_admin';
    const canCloseCash = isAdmin;

    const todayStr = todayBogota();
    const [selectedDate, setSelectedDate] = useState(todayStr);
    const [error, setError] = useState('');
    const [showOps, setShowOps] = useState(false);
    const [showHistory, setShowHistory] = useState(false);

    const isToday = selectedDate === todayStr;

    // ── Datos ──
    const { data: report, isLoading: reportLoading } = useQuery({
        queryKey: ['close-report', businessId, selectedDate],
        queryFn: () => getCloseReport(businessId, selectedDate),
        enabled: !!businessId,
    });

    // Estado hoy (para acciones cerrar/reabrir)
    const { data: today } = useQuery({
        queryKey: ['close-today', businessId],
        queryFn: () => getTodayClose(businessId),
        enabled: !!businessId && isToday,
    });

    const { data: history } = useQuery({
        queryKey: ['close-history', businessId],
        queryFn: () => listCloses(businessId),
        enabled: !!businessId && showHistory,
    });

    const refresh = () => {
        invalidateMoney(queryClient);
        queryClient.invalidateQueries({ queryKey: ['close-today', businessId] });
        queryClient.invalidateQueries({ queryKey: ['close-history', businessId] });
        queryClient.invalidateQueries({ queryKey: ['close-report', businessId, selectedDate] });
    };

    const isClosed = isToday ? today?.status === 'closed' : report?.meta?.close?.status === 'closed';
    const closeId  = isToday ? today?.id : report?.meta?.close?.id;

    const closeMut = useMutation({
        mutationFn: () => createClose({ businessId }),
        onSuccess: () => { setError(''); refresh(); },
        onError: (e: any) => setError(e?.response?.data?.error || 'No se pudo cerrar la caja'),
    });

    const reopenMut = useMutation({
        mutationFn: (id: string) => {
            const reason = window.prompt('Motivo de la reapertura:') || '';
            if (!reason.trim()) throw new Error('cancelado');
            return reopenClose(id, reason);
        },
        onSuccess: () => { setError(''); refresh(); },
        onError: (e: any) => { if (e?.message !== 'cancelado') setError(e?.response?.data?.error || 'No se pudo reabrir'); },
    });

    // ── Exportar Excel (CSV multi-sección) ──
    const exportExcel = (r: CloseReport) => {
        type Row = Record<string, string>;
        const rows: Row[] = [
            { S: 'KPI', A: 'Negocio',        B: r.meta.businessName },
            { S: 'KPI', A: 'Fecha',           B: r.meta.date },
            { S: 'KPI', A: 'Estado',          B: r.meta.close?.status === 'closed' ? 'Cerrado' : r.meta.close?.status === 'reopened' ? 'Reabierto' : 'Abierto' },
            { S: 'KPI', A: 'Pagos',           B: String(r.totals.numPagos) },
            { S: 'KPI', A: 'Total cobrado',   B: String(r.totals.totalCobrado) },
            { S: 'KPI', A: 'Ingresos',        B: String(r.totals.totalIngresos) },
            { S: 'KPI', A: 'Egresos',         B: String(r.totals.totalEgresos) },
            { S: 'KPI', A: 'Neto',            B: String(r.totals.neto) },
            { S: '',    A: '',                 B: '' },
            ...r.accounts.map(a => ({
                S: 'Cuenta', A: a.name, B: '',
                Apertura: String(a.apertura), Ingresos: String(a.ingresos),
                Egresos: String(a.egresos),   Esperado: String(a.esperado),
                Contado: a.contado !== null ? String(a.contado) : '',
                Diferencia: a.diferencia !== null ? String(a.diferencia) : '',
            })),
            { S: '', A: '', B: '' },
            // Liquidación por cobrador
            ...(r.collectors || []).map(c => ({
                S: 'Cobrador', A: c.cobradorNombre, B: String(c.totalCobrado),
                Pagos: String(c.numPagos),
                PorCuenta: c.porCuenta.map(pc => `${pc.cuenta}: $${Math.ceil(pc.monto).toLocaleString('es-CO')}`).join(' | '),
            })),
            { S: '', A: '', B: '' },
            ...(r.disbursers || []).map(d => ({
                S: 'Desembolso', A: d.usuarioNombre, B: String(d.totalDesembolsado),
                Pagos: String(d.numCreditos),
                PorCuenta: '',
            })),
            { S: '', A: '', B: '' },
            ...r.payments.map(p => ({
                S: 'Pago', A: p.clienteNombre, B: String(p.monto),
                Hora: FHour(p.hora),
                Cuota: p.cuotaNumero !== null ? `#${p.cuotaNumero}` : '—',
                Cuenta: p.cuenta, Cobrador: p.cobrador, CreditId: p.creditId,
            })),
            { S: '', A: '', B: '' },
            ...r.operations.map(op => ({
                S: 'Operacion', A: TYPE_LABELS[op.tipo] || op.tipo, B: String(op.monto),
                Hora: FHour(op.hora), Descripcion: op.descripcion,
                Cuenta: op.cuenta, Usuario: op.usuario,
            })),
        ];
        exportToCsv(`cierre-${r.meta.date}-${r.meta.businessName.replace(/\s+/g, '_')}.csv`, rows, [
            { header: 'Sección',    accessor: (x: any) => x.S },
            { header: 'Campo',      accessor: (x: any) => x.A },
            { header: 'Valor',      accessor: (x: any) => x.B },
            { header: 'Apertura',   accessor: (x: any) => x.Apertura || '' },
            { header: 'Ingresos',   accessor: (x: any) => x.Ingresos || '' },
            { header: 'Egresos',    accessor: (x: any) => x.Egresos || '' },
            { header: 'Esperado',   accessor: (x: any) => x.Esperado || '' },
            { header: 'Contado',    accessor: (x: any) => x.Contado || '' },
            { header: 'Diferencia', accessor: (x: any) => x.Diferencia || '' },
            { header: 'Hora',       accessor: (x: any) => x.Hora || '' },
            { header: 'Cuota #',    accessor: (x: any) => x.Cuota || '' },
            { header: 'Pagos',      accessor: (x: any) => x.Pagos || '' },
            { header: 'Por cuenta', accessor: (x: any) => x.PorCuenta || '' },
            { header: 'Cobrador',   accessor: (x: any) => x.Cobrador || '' },
            { header: 'Descripción',accessor: (x: any) => x.Descripcion || '' },
            { header: 'Usuario',    accessor: (x: any) => x.Usuario || '' },
            { header: 'CreditId',   accessor: (x: any) => x.CreditId || '' },
        ]);
    };

    const hasContado = report?.accounts?.some(a => a.contado !== null) ?? false;

    return (
        <div className="space-y-5">
            {error && (
                <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-2 flex items-center gap-2">
                    <AlertCircle size={16} /> {error}
                </div>
            )}

            {/* ── Selector de fecha ── */}
            <div className="flex flex-wrap items-center gap-3">
                <label className="text-sm font-semibold text-gray-700">Fecha del reporte:</label>
                <input
                    type="date"
                    value={selectedDate}
                    max={todayStr}
                    onChange={e => setSelectedDate(e.target.value)}
                    className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                />
                {!isToday && (
                    <button
                        onClick={() => setSelectedDate(todayStr)}
                        className="text-xs text-primary-600 hover:underline font-medium"
                    >
                        Ir a hoy
                    </button>
                )}
                {/* Badge estado */}
                {report?.meta?.close ? (
                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-full border
                        ${report.meta.close.status === 'closed'
                            ? 'bg-rose-50 text-rose-700 border-rose-200'
                            : 'bg-amber-50 text-amber-700 border-amber-200'}`}>
                        {report.meta.close.status === 'closed' ? <Lock size={11} /> : <Unlock size={11} />}
                        {report.meta.close.status === 'closed' ? 'Cerrado' : 'Reabierto'}
                        {' · '}
                        {report.meta.close.closeMode === 'auto' ? 'Automático' : 'Manual'}
                    </span>
                ) : (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-full border bg-emerald-50 text-emerald-700 border-emerald-200">
                        <Unlock size={11} /> {isToday ? 'Caja abierta' : 'Sin cierre registrado'}
                    </span>
                )}
            </div>

            {/* ── Acciones de hoy (cerrar / reabrir) ── */}
            {isToday && canCloseCash && (
                <div className={`rounded-xl border p-4 ${isClosed ? 'bg-rose-50 border-rose-200' : 'bg-emerald-50 border-emerald-200'}`}>
                    <div className="flex items-center justify-between flex-wrap gap-3">
                        <p className="text-sm font-semibold text-gray-800">
                            {isClosed
                                ? `Caja CERRADA — ${today?.closeMode === 'auto' ? 'automático' : 'manual'} · ${FDtTime(today?.closedAt)}`
                                : today?.status === 'reopened'
                                    ? `Caja REABIERTA · ${FDtTime(today?.reopenedAt)}`
                                    : 'Caja ABIERTA — aún no se ha cerrado la caja de hoy.'}
                        </p>
                        <div className="flex gap-2">
                            {!isClosed && canCloseCash && (
                                <button
                                    onClick={() => closeMut.mutate()}
                                    disabled={closeMut.isPending}
                                    className="flex items-center gap-2 px-4 py-2 bg-rose-600 text-white rounded-lg font-semibold text-sm hover:bg-rose-700 disabled:opacity-50"
                                >
                                    <Lock size={15} /> {closeMut.isPending ? 'Cerrando…' : 'Cerrar caja'}
                                </button>
                            )}
                            {isSuper && isClosed && closeId && (
                                <button
                                    onClick={() => reopenMut.mutate(closeId)}
                                    disabled={reopenMut.isPending}
                                    className="flex items-center gap-2 px-4 py-2 bg-amber-500 text-white rounded-lg font-semibold text-sm hover:bg-amber-600 disabled:opacity-50"
                                >
                                    <RotateCcw size={15} /> Reabrir
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* ── Cargando ── */}
            {reportLoading && (
                <div className="text-center py-10 text-gray-400 text-sm animate-pulse">Cargando reporte…</div>
            )}

            {report && !reportLoading && (
                <>
                    {/* ── KPIs ── */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        {[
                            { label: 'Total cobrado',   value: FM(report.totals.totalCobrado),  Icon: DollarSign,  cls: 'text-primary-600 bg-primary-50' },
                            { label: 'Pagos recibidos', value: String(report.totals.numPagos),   Icon: Users,       cls: 'text-blue-600    bg-blue-50' },
                            { label: 'Ingresos',        value: FM(report.totals.totalIngresos), Icon: TrendingUp,  cls: 'text-emerald-600 bg-emerald-50' },
                            { label: 'Egresos',         value: FM(report.totals.totalEgresos),  Icon: TrendingDown,cls: 'text-rose-600    bg-rose-50' },
                        ].map(k => (
                            <div key={k.label} className="bg-white rounded-xl border border-gray-200 p-4 flex items-center gap-3">
                                <div className={`p-2 rounded-lg ${k.cls}`}><k.Icon size={18} /></div>
                                <div>
                                    <p className="text-xs text-gray-500">{k.label}</p>
                                    <p className="font-bold text-gray-900 text-sm">{k.value}</p>
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* Neto */}
                    <div className={`rounded-lg border px-4 py-3 flex items-center justify-between ${report.totals.neto >= 0 ? 'bg-emerald-50 border-emerald-200' : 'bg-rose-50 border-rose-200'}`}>
                        <span className="text-sm font-semibold text-gray-700">Neto del día</span>
                        <span className={`font-bold text-lg ${report.totals.neto >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                            {FM(report.totals.neto)}
                        </span>
                    </div>

                    {/* ── Saldo por cuenta ── */}
                    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                        <div className="px-4 py-3 border-b border-gray-100 bg-gray-50/50 text-sm font-bold text-gray-800">
                            Saldo por cuenta
                        </div>
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="text-xs text-gray-500 border-b border-gray-100">
                                        <th className="px-4 py-2 text-left font-semibold uppercase">Cuenta</th>
                                        <th className="px-4 py-2 text-right font-semibold uppercase">Apertura</th>
                                        <th className="px-4 py-2 text-right font-semibold uppercase text-emerald-700">Ingresos</th>
                                        <th className="px-4 py-2 text-right font-semibold uppercase text-rose-700">Egresos</th>
                                        <th className="px-4 py-2 text-right font-semibold uppercase text-primary-700">Esperado</th>
                                        {hasContado && <th className="px-4 py-2 text-right font-semibold uppercase">Contado</th>}
                                        {hasContado && <th className="px-4 py-2 text-right font-semibold uppercase">Diferencia</th>}
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                    {report.accounts.map(a => (
                                        <tr key={a.accountId} className="hover:bg-gray-50">
                                            <td className="px-4 py-2.5 font-medium text-gray-800">{a.name}</td>
                                            <td className="px-4 py-2.5 text-right text-gray-600">{FM(a.apertura)}</td>
                                            <td className="px-4 py-2.5 text-right text-emerald-700 font-medium">{FM(a.ingresos)}</td>
                                            <td className="px-4 py-2.5 text-right text-rose-700 font-medium">{a.egresos !== 0 ? FM(a.egresos) : '—'}</td>
                                            <td className="px-4 py-2.5 text-right font-bold text-primary-700">{FM(a.esperado)}</td>
                                            {hasContado && <td className="px-4 py-2.5 text-right">{a.contado !== null ? FM(a.contado) : '—'}</td>}
                                            {hasContado && (
                                                <td className={`px-4 py-2.5 text-right font-semibold ${(a.diferencia ?? 0) < 0 ? 'text-rose-600' : (a.diferencia ?? 0) > 0 ? 'text-emerald-600' : 'text-gray-500'}`}>
                                                    {a.diferencia !== null ? FM(a.diferencia) : '—'}
                                                </td>
                                            )}
                                        </tr>
                                    ))}
                                    <tr className="bg-gray-50 font-bold">
                                        <td className="px-4 py-2.5 text-gray-900">Total</td>
                                        <td className="px-4 py-2.5 text-right text-gray-700">{FM(report.accounts.reduce((s, a) => s + a.apertura, 0))}</td>
                                        <td className="px-4 py-2.5 text-right text-emerald-700">{FM(report.totals.totalIngresos)}</td>
                                        <td className="px-4 py-2.5 text-right text-rose-700">{FM(report.totals.totalEgresos)}</td>
                                        <td className="px-4 py-2.5 text-right text-primary-700">{FM(report.accounts.reduce((s, a) => s + a.esperado, 0))}</td>
                                        {hasContado && <td colSpan={2} />}
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                    </div>

                    {/* ── Pagos del día ── */}
                    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                        <div className="px-4 py-3 border-b border-gray-100 bg-gray-50/50 text-sm font-bold text-gray-800">
                            Pagos del día ({report.payments.length})
                        </div>
                        {report.payments.length === 0 ? (
                            <p className="px-4 py-6 text-center text-gray-400 text-sm">Sin pagos registrados en este día</p>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                    <thead>
                                        <tr className="text-xs text-gray-500 border-b border-gray-100">
                                            <th className="px-4 py-2 text-left font-semibold uppercase">Hora</th>
                                            <th className="px-4 py-2 text-left font-semibold uppercase">Cliente</th>
                                            <th className="px-4 py-2 text-center font-semibold uppercase">Cuota #</th>
                                            <th className="px-4 py-2 text-right font-semibold uppercase">Monto</th>
                                            <th className="px-4 py-2 text-left font-semibold uppercase">Cuenta</th>
                                            <th className="px-4 py-2 text-left font-semibold uppercase">Cobrador</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-100">
                                        {report.payments.map(p => (
                                            <tr key={p.id} className="hover:bg-gray-50">
                                                <td className="px-4 py-2.5 text-gray-500 text-xs tabular-nums">{FHour(p.hora)}</td>
                                                <td className="px-4 py-2.5 font-medium text-gray-900">{p.clienteNombre}</td>
                                                <td className="px-4 py-2.5 text-center">
                                                    {p.cuotaNumero !== null
                                                        ? <span className="bg-primary-100 text-primary-700 text-xs font-bold px-2 py-0.5 rounded-full">#{p.cuotaNumero}</span>
                                                        : <span className="text-gray-400">—</span>}
                                                </td>
                                                <td className="px-4 py-2.5 text-right font-bold text-gray-900">{FM(p.monto)}</td>
                                                <td className="px-4 py-2.5 text-gray-600">{p.cuenta}</td>
                                                <td className="px-4 py-2.5 text-gray-600">{p.cobrador}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>

                    {/* ── Resumen por cobrador ── */}
                    {report.collectors && report.collectors.length > 0 && (
                        <div className="bg-white rounded-xl border border-amber-200 overflow-hidden">
                            <div className="px-4 py-3 border-b border-amber-100 bg-amber-50/60 flex items-center gap-2">
                                <UserCheck size={16} className="text-amber-700" />
                                <span className="text-sm font-bold text-amber-900">
                                    Liquidación por cobrador ({report.collectors.length})
                                </span>
                                <span className="text-xs text-amber-600 ml-1">— lo que debes recibir de cada uno</span>
                            </div>
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                    <thead>
                                        <tr className="text-xs text-gray-500 border-b border-gray-100">
                                            <th className="px-4 py-2 text-left font-semibold uppercase">Cobrador</th>
                                            <th className="px-4 py-2 text-center font-semibold uppercase">Pagos</th>
                                            {/* Columnas dinámicas por cuenta */}
                                            {Array.from(
                                                new Set(report.collectors.flatMap(c => c.porCuenta.map(pc => pc.cuenta)))
                                            ).map(cuenta => (
                                                <th key={cuenta} className="px-4 py-2 text-right font-semibold uppercase text-gray-600">{cuenta}</th>
                                            ))}
                                            <th className="px-4 py-2 text-right font-semibold uppercase text-primary-700">Total</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-100">
                                        {(() => {
                                            const allCuentas = Array.from(
                                                new Set(report.collectors.flatMap(c => c.porCuenta.map(pc => pc.cuenta)))
                                            );
                                            return report.collectors.map(c => (
                                                <tr key={c.cobradorId} className="hover:bg-amber-50/30">
                                                    <td className="px-4 py-3 font-semibold text-gray-900">{c.cobradorNombre}</td>
                                                    <td className="px-4 py-3 text-center text-gray-500">{c.numPagos}</td>
                                                    {allCuentas.map(cuenta => {
                                                        const entry = c.porCuenta.find(pc => pc.cuenta === cuenta);
                                                        return (
                                                            <td key={cuenta} className="px-4 py-3 text-right text-gray-700">
                                                                {entry ? FM(entry.monto) : <span className="text-gray-300">—</span>}
                                                            </td>
                                                        );
                                                    })}
                                                    <td className="px-4 py-3 text-right font-bold text-primary-700">{FM(c.totalCobrado)}</td>
                                                </tr>
                                            ));
                                        })()}
                                        {/* Fila de totales */}
                                        {report.collectors.length > 1 && (
                                            <tr className="bg-gray-50 font-bold border-t-2 border-gray-200">
                                                <td className="px-4 py-2.5 text-gray-900">Total</td>
                                                <td className="px-4 py-2.5 text-center text-gray-700">
                                                    {report.collectors.reduce((s, c) => s + c.numPagos, 0)}
                                                </td>
                                                {Array.from(
                                                    new Set(report.collectors.flatMap(c => c.porCuenta.map(pc => pc.cuenta)))
                                                ).map(cuenta => (
                                                    <td key={cuenta} className="px-4 py-2.5 text-right text-gray-800">
                                                        {FM(report.collectors.reduce((s, c) => {
                                                            const e = c.porCuenta.find(pc => pc.cuenta === cuenta);
                                                            return s + (e?.monto || 0);
                                                        }, 0))}
                                                    </td>
                                                ))}
                                                <td className="px-4 py-2.5 text-right text-primary-700">
                                                    {FM(report.collectors.reduce((s, c) => s + c.totalCobrado, 0))}
                                                </td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}

                    {/* ── Créditos colocados por usuario ── */}
                    {report.disbursers && report.disbursers.length > 0 && (
                        <div className="bg-white rounded-xl border border-blue-200 overflow-hidden">
                            <div className="px-4 py-3 border-b border-blue-100 bg-blue-50/60 flex items-center gap-2">
                                <TrendingDown size={16} className="text-blue-700" />
                                <span className="text-sm font-bold text-blue-900">
                                    Créditos colocados por usuario ({report.disbursers.length})
                                </span>
                                <span className="text-xs text-blue-600 ml-1">— salidas de caja por desembolsos</span>
                            </div>
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                    <thead>
                                        <tr className="text-xs text-gray-500 border-b border-gray-100">
                                            <th className="px-4 py-2 text-left font-semibold uppercase">Usuario</th>
                                            <th className="px-4 py-2 text-center font-semibold uppercase">Créditos</th>
                                            <th className="px-4 py-2 text-right font-semibold uppercase text-blue-700">Total desembolsado</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-100">
                                        {report.disbursers.map(d => (
                                            <tr key={d.usuarioId} className="hover:bg-blue-50/30">
                                                <td className="px-4 py-3 font-semibold text-gray-900">{d.usuarioNombre}</td>
                                                <td className="px-4 py-3 text-center text-gray-500">{d.numCreditos}</td>
                                                <td className="px-4 py-3 text-right font-bold text-blue-700">{FM(d.totalDesembolsado)}</td>
                                            </tr>
                                        ))}
                                        {report.disbursers.length > 1 && (
                                            <tr className="bg-gray-50 font-bold border-t-2 border-gray-200">
                                                <td className="px-4 py-2.5 text-gray-900">Total</td>
                                                <td className="px-4 py-2.5 text-center text-gray-700">
                                                    {report.disbursers.reduce((s, d) => s + d.numCreditos, 0)}
                                                </td>
                                                <td className="px-4 py-2.5 text-right text-blue-700">
                                                    {FM(report.disbursers.reduce((s, d) => s + d.totalDesembolsado, 0))}
                                                </td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}

                    {/* ── Operaciones del día (colapsable) ── */}
                    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                        <button
                            onClick={() => setShowOps(v => !v)}
                            className="w-full px-4 py-3 border-b border-gray-100 bg-gray-50/50 text-sm font-bold text-gray-800 flex items-center justify-between hover:bg-gray-100"
                        >
                            <span>Operaciones del día ({report.operations.length})</span>
                            {showOps ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                        </button>
                        {showOps && (
                            report.operations.length === 0 ? (
                                <p className="px-4 py-6 text-center text-gray-400 text-sm">Sin operaciones en este día</p>
                            ) : (
                                <div className="overflow-x-auto">
                                    <table className="w-full text-sm">
                                        <thead>
                                            <tr className="text-xs text-gray-500 border-b border-gray-100">
                                                <th className="px-4 py-2 text-left font-semibold uppercase">Hora</th>
                                                <th className="px-4 py-2 text-left font-semibold uppercase">Tipo</th>
                                                <th className="px-4 py-2 text-left font-semibold uppercase">Descripción</th>
                                                <th className="px-4 py-2 text-left font-semibold uppercase">Cuenta</th>
                                                <th className="px-4 py-2 text-right font-semibold uppercase">Efecto</th>
                                                <th className="px-4 py-2 text-left font-semibold uppercase">Usuario</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-100">
                                            {report.operations.map(op => (
                                                <tr key={op.id} className="hover:bg-gray-50">
                                                    <td className="px-4 py-2.5 text-gray-500 text-xs tabular-nums">{FHour(op.hora)}</td>
                                                    <td className="px-4 py-2.5">
                                                        <span className={`inline-block px-2 py-0.5 text-xs rounded border font-medium ${op.efectoSignado >= 0 ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-rose-50 text-rose-700 border-rose-200'}`}>
                                                            {TYPE_LABELS[op.tipo] || op.tipo}
                                                        </span>
                                                    </td>
                                                    <td className="px-4 py-2.5 text-gray-600 max-w-[160px] truncate">{op.descripcion || '—'}</td>
                                                    <td className="px-4 py-2.5 text-gray-600">{op.cuenta}</td>
                                                    <td className={`px-4 py-2.5 text-right font-bold ${op.efectoSignado >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                                                        {op.efectoSignado >= 0 ? '+' : ''}{FM(op.efectoSignado)}
                                                    </td>
                                                    <td className="px-4 py-2.5 text-gray-600">{op.usuario}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )
                        )}
                    </div>

                    {/* ── Botones descarga ── */}
                    <div className="flex gap-3 flex-wrap">
                        <button
                            onClick={() => generateCloseReportPdf(report)}
                            className="flex items-center gap-2 px-4 py-2 bg-rose-600 text-white rounded-lg font-semibold text-sm hover:bg-rose-700 transition-colors"
                        >
                            <FileDown size={16} /> Descargar PDF
                        </button>
                        <button
                            onClick={() => exportExcel(report)}
                            className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg font-semibold text-sm hover:bg-emerald-700 transition-colors"
                        >
                            <FileSpreadsheet size={16} /> Descargar Excel
                        </button>
                    </div>
                </>
            )}

            {/* ── Historial de cierres (colapsable) ── */}
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                <button
                    onClick={() => setShowHistory(v => !v)}
                    className="w-full px-4 py-3 border-b border-gray-100 bg-gray-50/50 text-sm font-bold text-gray-800 flex items-center justify-between hover:bg-gray-100"
                >
                    <span className="flex items-center gap-2"><Clock size={15} /> Historial de cierres</span>
                    {showHistory ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                </button>
                {showHistory && (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead className="text-gray-500">
                                <tr>
                                    <th className="px-4 py-2 text-left text-xs font-semibold uppercase">Fecha</th>
                                    <th className="px-4 py-2 text-left text-xs font-semibold uppercase">Estado</th>
                                    <th className="px-4 py-2 text-left text-xs font-semibold uppercase">Modo</th>
                                    <th className="px-4 py-2 text-right text-xs font-semibold uppercase">Total</th>
                                    <th className="px-4 py-2" />
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {(!history || history.length === 0) ? (
                                    <tr><td colSpan={5} className="px-4 py-6 text-center text-gray-400">Sin cierres registrados</td></tr>
                                ) : history.map(c => (
                                    <tr
                                        key={c.id}
                                        className="hover:bg-gray-50 cursor-pointer"
                                        title="Clic para ver el reporte de este día"
                                        onClick={() => {
                                            const d = new Date(c.closeDate);
                                            setSelectedDate(new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(d));
                                            window.scrollTo({ top: 0, behavior: 'smooth' });
                                        }}
                                    >
                                        <td className="px-4 py-2.5 text-gray-700">{FDt(c.closeDate)}</td>
                                        <td className="px-4 py-2.5">
                                            <span className={`inline-block px-2 py-0.5 text-xs font-medium rounded border ${c.status === 'closed' ? 'bg-rose-50 text-rose-700 border-rose-200' : 'bg-amber-50 text-amber-700 border-amber-200'}`}>
                                                {c.status === 'closed' ? 'Cerrado' : 'Reabierto'}
                                            </span>
                                        </td>
                                        <td className="px-4 py-2.5 text-gray-500 text-xs">{c.closeMode === 'auto' ? 'Automático' : 'Manual'}</td>
                                        <td className="px-4 py-2.5 text-right font-semibold text-gray-900">{FM(c.totalBalance)}</td>
                                        <td className="px-4 py-2.5 text-right">
                                            {isSuper && c.status === 'closed' && (
                                                <button
                                                    onClick={e => { e.stopPropagation(); reopenMut.mutate(c.id); }}
                                                    className="text-xs text-amber-600 hover:underline"
                                                >
                                                    Reabrir
                                                </button>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
}
