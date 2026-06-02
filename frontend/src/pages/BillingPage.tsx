import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { FileText, Save, DollarSign, TrendingUp, Calendar, History, Building2, Loader2 } from 'lucide-react';
import {
    getBillingSummary, updateBusinessPrice, createBilling, listBillings,
    getUnbilledCredits,
    type BillingSummaryItem,
    type CreditBillingItem,
} from '../api/billing.api';
import { generateBillingPdf } from '../utils/generateBillingPdf';

const FM = (v: number) => `$${Math.ceil(v).toLocaleString('es-CO')}`;

type Preset = 'thisMonth' | 'last7' | 'last30' | 'custom';

function getRange(preset: Preset, custom: { start: string; end: string }): { start: string; end: string } {
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    const fmt = (d: Date)   => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    if (preset === 'thisMonth') {
        return { start: fmt(new Date(now.getFullYear(), now.getMonth(), 1)), end: fmt(now) };
    }
    if (preset === 'last7') {
        const s = new Date(now); s.setDate(s.getDate() - 6);
        return { start: fmt(s), end: fmt(now) };
    }
    if (preset === 'last30') {
        const s = new Date(now); s.setDate(s.getDate() - 29);
        return { start: fmt(s), end: fmt(now) };
    }
    return custom;
}

type PriceMap = Record<string, string>;

export default function BillingPage() {
    const qc = useQueryClient();

    // ── Período ──
    const [preset, setPreset]   = useState<Preset>('thisMonth');
    const [custom, setCustom]   = useState({ start: '', end: '' });
    const range = getRange(preset, custom);

    // ── Resumen ──
    const { data: summary = [], isLoading: summaryLoading } = useQuery({
        queryKey: ['billing-summary', range.start, range.end],
        queryFn:  () => getBillingSummary(range.start, range.end),
        enabled:  !!range.start && !!range.end,
    });

    // Precios locales
    const [priceMap, setPriceMap] = useState<PriceMap>({});
    useEffect(() => {
        const map: PriceMap = {};
        summary.forEach(b => { map[b.businessId] = String(b.pricePerUnit || ''); });
        setPriceMap(map);
    }, [summary]);

    const priceMutation = useMutation({
        mutationFn: ({ id, price }: { id: string; price: number }) => updateBusinessPrice(id, price),
    });

    // ── Guardar cobro ──
    // Después de guardar, refrescamos el resumen (los créditos quedan marcados)
    const saveMutation = useMutation({
        mutationFn: createBilling,
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['billing-summary'] });
            qc.invalidateQueries({ queryKey: ['billing-history'] });
        },
    });

    // ── Historial ──
    const [histPreset, setHistPreset] = useState<Preset>('thisMonth');
    const histRange = getRange(histPreset, { start: '', end: '' });
    const { data: history = [], isLoading: histLoading } = useQuery({
        queryKey: ['billing-history', histRange.start, histRange.end],
        queryFn:  () => listBillings({ startDate: histRange.start, endDate: histRange.end }),
    });

    // ── Estado de PDF en progreso (por negocio) ──
    const [pdfLoading, setPdfLoading] = useState<Record<string, boolean>>({});

    // ── Handlers ──
    const handlePriceBlur = (bizId: string) => {
        const val = Number((priceMap[bizId] || '0').replace(/[^0-9]/g, ''));
        priceMutation.mutate({ id: bizId, price: val });
    };

    const handleSave = (item: BillingSummaryItem) => {
        const price = Number((priceMap[item.businessId] || '0').replace(/[^0-9]/g, ''));
        saveMutation.mutate({
            businessId:   item.businessId,
            businessName: item.businessName,
            periodStart:  range.start,
            periodEnd:    range.end,
            pricePerUnit: price,
        });
    };

    /**
     * PDF PRE-GUARDADO: obtiene los créditos en tiempo real y genera el PDF.
     * Los créditos aún NO están marcados como cobrados.
     */
    const handlePdf = async (item: BillingSummaryItem) => {
        const price = Number((priceMap[item.businessId] || '0').replace(/[^0-9]/g, ''));
        setPdfLoading(m => ({ ...m, [item.businessId]: true }));
        try {
            const credits: CreditBillingItem[] = await getUnbilledCredits(
                item.businessId, range.start, range.end,
            );
            generateBillingPdf(
                {
                    id:           item.businessId,
                    businessId:   item.businessId,
                    businessName: item.businessName,
                    periodStart:  range.start + 'T00:00:00.000Z',
                    periodEnd:    range.end   + 'T23:59:59.999Z',
                    creditsCount: item.creditsCount,
                    pricePerUnit: price,
                    totalAmount:  item.creditsCount * price,
                    createdAt:    new Date().toISOString(),
                },
                credits,
            );
        } finally {
            setPdfLoading(m => ({ ...m, [item.businessId]: false }));
        }
    };

    /** PDF desde el historial: usa los créditos ya guardados en el registro. */
    const handleHistoryPdf = (b: (typeof history)[0]) => {
        generateBillingPdf(b, b.credits ?? []);
    };

    const totalCobro   = summary.reduce((s, b) => {
        const p = Number((priceMap[b.businessId] || '0').replace(/[^0-9]/g, ''));
        return s + b.creditsCount * p;
    }, 0);
    const totalCredits = summary.reduce((s, b) => s + b.creditsCount, 0);

    const presetLabel = (p: Preset) =>
        p === 'thisMonth' ? 'Este mes' :
        p === 'last7'     ? 'Últimos 7 días' :
        p === 'last30'    ? 'Últimos 30 días' : 'Personalizado';

    return (
        <div className="p-4 sm:p-6 space-y-6 max-w-6xl mx-auto">
            {/* Header */}
            <div>
                <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                    <DollarSign className="text-primary-600" size={24} />
                    Facturación
                </h1>
                <p className="text-sm text-gray-500 mt-0.5">Cobro mensual a negocios por créditos creados</p>
            </div>

            {/* Selector de período */}
            <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
                <p className="text-xs font-bold text-gray-500 uppercase tracking-wider flex items-center gap-1.5">
                    <Calendar size={13} /> Período de análisis
                </p>
                <div className="flex flex-wrap gap-2">
                    {(['thisMonth', 'last7', 'last30', 'custom'] as Preset[]).map(p => (
                        <button key={p} onClick={() => setPreset(p)}
                            className={`px-3 py-1.5 rounded-lg text-sm font-semibold transition-all ${
                                preset === p
                                    ? 'bg-primary-600 text-white shadow'
                                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                            }`}>
                            {presetLabel(p)}
                        </button>
                    ))}
                </div>
                {preset === 'custom' && (
                    <div className="flex gap-3">
                        <input type="date" value={custom.start}
                            onChange={e => setCustom(c => ({ ...c, start: e.target.value }))}
                            className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm" />
                        <span className="self-center text-gray-400">—</span>
                        <input type="date" value={custom.end}
                            onChange={e => setCustom(c => ({ ...c, end: e.target.value }))}
                            className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm" />
                    </div>
                )}
                {range.start && (
                    <p className="text-xs text-gray-400">{range.start} — {range.end}</p>
                )}
            </div>

            {/* KPIs */}
            <div className="grid grid-cols-2 gap-4">
                <div className="bg-white rounded-xl border border-gray-200 p-4 flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-blue-50"><TrendingUp size={18} className="text-blue-600" /></div>
                    <div>
                        <p className="text-xs text-gray-500">Créditos cobrables</p>
                        <p className="font-bold text-gray-900 text-lg">{totalCredits.toLocaleString('es-CO')}</p>
                    </div>
                </div>
                <div className="bg-white rounded-xl border border-gray-200 p-4 flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-emerald-50"><DollarSign size={18} className="text-emerald-600" /></div>
                    <div>
                        <p className="text-xs text-gray-500">Total a cobrar</p>
                        <p className="font-bold text-emerald-700 text-lg">{FM(totalCobro)}</p>
                    </div>
                </div>
            </div>

            {/* Tabla de negocios */}
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                <div className="px-4 py-3 border-b border-gray-100 bg-gray-50/50 flex items-center justify-between">
                    <span className="text-sm font-bold text-gray-800 flex items-center gap-2">
                        <Building2 size={15} /> Cobro por negocio
                    </span>
                    <span className="text-xs text-gray-400">Solo créditos aún no cobrados · cancelados excluidos del total</span>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="text-xs text-gray-500 border-b border-gray-100">
                                <th className="px-4 py-2 text-left font-semibold uppercase">Negocio</th>
                                <th className="px-4 py-2 text-right font-semibold uppercase">Créditos</th>
                                <th className="px-4 py-2 text-right font-semibold uppercase">Precio/crédito</th>
                                <th className="px-4 py-2 text-right font-semibold uppercase text-emerald-700">Total</th>
                                <th className="px-4 py-2 text-center font-semibold uppercase">Acciones</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {summaryLoading && (
                                <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-400">Cargando...</td></tr>
                            )}
                            {!summaryLoading && summary.length === 0 && (
                                <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-400">No hay negocios registrados</td></tr>
                            )}
                            {summary.map(item => {
                                const price = Number((priceMap[item.businessId] || '0').replace(/[^0-9]/g, ''));
                                const total = item.creditsCount * price;
                                return (
                                    <tr key={item.businessId} className="hover:bg-gray-50">
                                        <td className="px-4 py-3 font-medium text-gray-800">{item.businessName}</td>
                                        <td className="px-4 py-3 text-right text-blue-700 font-semibold">{item.creditsCount}</td>
                                        <td className="px-4 py-3 text-right">
                                            <input
                                                type="text"
                                                value={priceMap[item.businessId] ?? ''}
                                                onChange={e => {
                                                    const raw = e.target.value.replace(/[^0-9]/g, '');
                                                    setPriceMap(m => ({ ...m, [item.businessId]: raw ? Number(raw).toLocaleString('es-CO') : '' }));
                                                }}
                                                onBlur={() => handlePriceBlur(item.businessId)}
                                                placeholder="$0"
                                                className="w-28 px-2 py-1 text-right bg-gray-50 border border-gray-200 rounded-lg text-sm font-medium focus:ring-2 focus:ring-primary-500 outline-none"
                                            />
                                        </td>
                                        <td className="px-4 py-3 text-right font-bold text-emerald-700">{FM(total)}</td>
                                        <td className="px-4 py-3">
                                            <div className="flex items-center justify-center gap-2">
                                                <button
                                                    onClick={() => handleSave(item)}
                                                    disabled={saveMutation.isPending || item.creditsCount === 0}
                                                    title="Guardar cobro (marca créditos como cobrados)"
                                                    className="p-1.5 bg-primary-50 text-primary-700 hover:bg-primary-100 rounded-lg transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                                                >
                                                    <Save size={15} />
                                                </button>
                                                <button
                                                    onClick={() => handlePdf(item)}
                                                    disabled={pdfLoading[item.businessId]}
                                                    title="Generar PDF con detalle de créditos"
                                                    className="p-1.5 bg-rose-50 text-rose-700 hover:bg-rose-100 rounded-lg transition-all disabled:opacity-40"
                                                >
                                                    {pdfLoading[item.businessId]
                                                        ? <Loader2 size={15} className="animate-spin" />
                                                        : <FileText size={15} />}
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                            {summary.length > 0 && (
                                <tr className="bg-gray-50 font-bold">
                                    <td className="px-4 py-2.5 text-gray-900">Total</td>
                                    <td className="px-4 py-2.5 text-right text-blue-700">{totalCredits}</td>
                                    <td className="px-4 py-2.5" />
                                    <td className="px-4 py-2.5 text-right text-emerald-700">{FM(totalCobro)}</td>
                                    <td />
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Historial */}
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                <div className="px-4 py-3 border-b border-gray-100 bg-gray-50/50 flex items-center justify-between">
                    <span className="text-sm font-bold text-gray-800 flex items-center gap-2">
                        <History size={15} /> Historial de cobros guardados
                    </span>
                    <div className="flex gap-1.5">
                        {(['thisMonth', 'last7', 'last30'] as Preset[]).map(p => (
                            <button key={p} onClick={() => setHistPreset(p)}
                                className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all ${
                                    histPreset === p ? 'bg-primary-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                                }`}>
                                {presetLabel(p)}
                            </button>
                        ))}
                    </div>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="text-xs text-gray-500 border-b border-gray-100">
                                <th className="px-4 py-2 text-left font-semibold uppercase">Fecha generación</th>
                                <th className="px-4 py-2 text-left font-semibold uppercase">Negocio</th>
                                <th className="px-4 py-2 text-center font-semibold uppercase">Período</th>
                                <th className="px-4 py-2 text-right font-semibold uppercase">Créditos</th>
                                <th className="px-4 py-2 text-right font-semibold uppercase">Total</th>
                                <th className="px-4 py-2 text-center font-semibold uppercase">PDF</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {histLoading && (
                                <tr><td colSpan={6} className="px-4 py-6 text-center text-gray-400">Cargando...</td></tr>
                            )}
                            {!histLoading && history.length === 0 && (
                                <tr><td colSpan={6} className="px-4 py-6 text-center text-gray-400">Aún no hay cobros guardados en este período</td></tr>
                            )}
                            {history.map(b => (
                                <tr key={b.id} className="hover:bg-gray-50">
                                    <td className="px-4 py-2.5 text-gray-600 text-xs">
                                        {new Date(b.createdAt).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' })}
                                    </td>
                                    <td className="px-4 py-2.5 font-medium text-gray-800">{b.businessName}</td>
                                    <td className="px-4 py-2.5 text-center text-gray-500 text-xs">
                                        {b.periodStart.slice(0, 10)} — {b.periodEnd.slice(0, 10)}
                                    </td>
                                    <td className="px-4 py-2.5 text-right text-blue-700 font-semibold">{b.creditsCount}</td>
                                    <td className="px-4 py-2.5 text-right font-bold text-emerald-700">{FM(Number(b.totalAmount))}</td>
                                    <td className="px-4 py-2.5 text-center">
                                        <button onClick={() => handleHistoryPdf(b)}
                                            title="Re-generar PDF del cobro guardado"
                                            className="p-1.5 bg-rose-50 text-rose-700 hover:bg-rose-100 rounded-lg transition-all">
                                            <FileText size={14} />
                                        </button>
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
