import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useQueryClient } from '@tanstack/react-query';
import { registerPayment } from '../../api/payments.api';
import { Save, X, CheckSquare, Square, AlertCircle, TrendingUp, TrendingDown } from 'lucide-react';
import { todayBogota, isOverdueBogota, formatDate } from '../../utils/dates';

interface PaymentModalProps {
    creditId: string;
    onClose: () => void;
    onSuccess: () => void;
    maxAmount?: number;
    remainingBalance: number;
    paymentSchedule?: any[];
}

const formatMoney = (val: any) => `$${Math.ceil(Number(val || 0)).toLocaleString('es-CO')}`;
const parseMoney = (str: string) => Number(str.replace(/[^0-9]/g, '')) || 0;

const PaymentModal: React.FC<PaymentModalProps> = ({
    creditId,
    onClose,
    onSuccess,
    remainingBalance,
    paymentSchedule = [],
}) => {
    const queryClient = useQueryClient();
    const [formData, setFormData] = useState({
        paymentDate: todayBogota(),
        paymentMethod: 'efectivo',
        notes: '',
    });
    const [error, setError] = useState('');
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [isSubmitting, setIsSubmitting] = useState(false);

    // Mapa de montos personalizados por cuota: scheduleId → string (formatted)
    const [customAmounts, setCustomAmounts] = useState<Record<string, string>>({});

    const pendingSchedules = [...paymentSchedule]
        .filter((s) => Number(s.scheduledAmount) > Number(s.paidAmount))
        .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime());

    // Inicializar con la primera cuota seleccionada y su monto por defecto
    useEffect(() => {
        if (pendingSchedules.length > 0) {
            const first = pendingSchedules[0];
            setSelectedIds(new Set([first.id]));
            const defaultAmt = Number(first.scheduledAmount) - Number(first.paidAmount || 0);
            setCustomAmounts({ [first.id]: Math.ceil(defaultAmt).toLocaleString('es-CO') });
        }
    }, []);

    const toggleSchedule = (s: any) => {
        setSelectedIds((prev) => {
            const next = new Set(prev);
            if (next.has(s.id)) {
                next.delete(s.id);
            } else {
                next.add(s.id);
                // Setear monto por defecto si no tiene uno
                if (!customAmounts[s.id]) {
                    const defaultAmt = Number(s.scheduledAmount) - Number(s.paidAmount || 0);
                    setCustomAmounts((prev) => ({
                        ...prev,
                        [s.id]: Math.ceil(defaultAmt).toLocaleString('es-CO'),
                    }));
                }
            }
            return next;
        });
    };

    const selectAll = () => {
        setSelectedIds(new Set(pendingSchedules.map((s) => s.id)));
        const defaults: Record<string, string> = {};
        pendingSchedules.forEach((s) => {
            if (!customAmounts[s.id]) {
                const defaultAmt = Number(s.scheduledAmount) - Number(s.paidAmount || 0);
                defaults[s.id] = Math.ceil(defaultAmt).toLocaleString('es-CO');
            }
        });
        setCustomAmounts((prev) => ({ ...prev, ...defaults }));
    };

    const clearAll = () => setSelectedIds(new Set());

    const getAmount = (s: any): number => {
        if (customAmounts[s.id]) return parseMoney(customAmounts[s.id]);
        return Number(s.scheduledAmount) - Number(s.paidAmount || 0);
    };

    const totalSelected = pendingSchedules
        .filter((s) => selectedIds.has(s.id))
        .reduce((acc, s) => acc + getAmount(s), 0);

    const scheduledTotal = pendingSchedules
        .filter((s) => selectedIds.has(s.id))
        .reduce((acc, s) => acc + (Number(s.scheduledAmount) - Number(s.paidAmount || 0)), 0);

    const overpayment = totalSelected > scheduledTotal ? totalSelected - scheduledTotal : 0;
    const underpayment = totalSelected < scheduledTotal ? scheduledTotal - totalSelected : 0;

    const handleSubmit = async (e?: React.FormEvent | React.MouseEvent) => {
        e?.preventDefault();
        setError('');

        if (selectedIds.size === 0) return setError('Selecciona al menos una cuota a pagar');
        if (totalSelected <= 0) return setError('El monto total debe ser mayor a 0');
        if (totalSelected > remainingBalance + 1) return setError('El monto total supera el saldo pendiente del crédito');

        const schedulesToPay = pendingSchedules.filter((s) => selectedIds.has(s.id));
        setIsSubmitting(true);

        try {
            for (const s of schedulesToPay) {
                const amount = getAmount(s);
                if (amount <= 0) continue;
                await registerPayment({
                    creditId,
                    amount,
                    paymentDate: formData.paymentDate,
                    paymentMethod: formData.paymentMethod || undefined,
                    notes: formData.notes || undefined,
                    scheduleId: s.id,
                });
            }
            queryClient.invalidateQueries({ queryKey: ['credit', creditId] });
            queryClient.invalidateQueries({ queryKey: ['credits'] });
            onSuccess();
        } catch (err: any) {
            const msg =
                err.response?.data?.errors?.[0]?.msg ||
                err.response?.data?.error ||
                'Error al registrar pago';
            setError(msg);
        } finally {
            setIsSubmitting(false);
        }
    };

    return createPortal(
        <div className="fixed inset-0 z-[9999] flex flex-col bg-black/60">
            <div className="
                flex flex-col bg-white w-full h-full
                sm:rounded-xl sm:shadow-2xl sm:w-full sm:max-w-lg
                sm:h-auto sm:max-h-[92vh]
                sm:m-auto
            ">
                {/* ── HEADER ── */}
                <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 bg-white shrink-0">
                    <div>
                        <h3 className="text-lg font-bold text-gray-900">Registrar Pago</h3>
                        <p className="text-xs text-gray-500 mt-0.5">Saldo pendiente total: {formatMoney(remainingBalance)}</p>
                    </div>
                    <button onClick={onClose} className="p-2 rounded-xl text-gray-500 hover:text-gray-900 hover:bg-gray-100 transition">
                        <X size={22} />
                    </button>
                </div>

                {/* ── CONTENIDO SCROLLABLE ── */}
                <div className="flex-1 overflow-y-auto overscroll-contain">
                    <div className="px-5 pt-4 pb-2 space-y-4">
                        {error && (
                            <div className="flex items-center gap-2 bg-red-50 text-red-700 border border-red-200 p-3 rounded-xl text-sm">
                                <AlertCircle size={16} className="shrink-0" />
                                {error}
                            </div>
                        )}

                        {/* ── Selección de cuotas ── */}
                        <div>
                            <div className="flex items-center justify-between mb-2">
                                <label className="text-sm font-semibold text-gray-800">
                                    Cuotas a pagar <span className="text-primary-600 font-normal">({selectedIds.size} selec.)</span>
                                </label>
                                <div className="flex gap-3 text-xs">
                                    <button type="button" onClick={selectAll} className="text-primary-600 font-medium hover:text-primary-800">
                                        Todas
                                    </button>
                                    <button type="button" onClick={clearAll} className="text-gray-500 hover:text-gray-700">
                                        Limpiar
                                    </button>
                                </div>
                            </div>

                            {pendingSchedules.length === 0 ? (
                                <p className="text-sm text-gray-500 py-4 text-center border rounded-xl bg-gray-50">
                                    ✅ No hay cuotas pendientes de pago.
                                </p>
                            ) : (
                                <div className="border border-gray-200 rounded-xl overflow-hidden">
                                    {pendingSchedules.map((s, idx) => {
                                        const defaultAmt = Number(s.scheduledAmount) - Number(s.paidAmount || 0);
                                        const currentAmt = getAmount(s);
                                        const isSelected = selectedIds.has(s.id);
                                        const isOverdue = isOverdueBogota(s.dueDate);
                                        const diff = currentAmt - defaultAmt;

                                        return (
                                            <div
                                                key={s.id}
                                                className={`border-b last:border-0 transition-colors ${isSelected ? 'bg-primary-50' : idx % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}`}
                                            >
                                                {/* Fila principal: checkbox + info */}
                                                <div
                                                    className="flex items-center gap-3 px-3 py-2.5 cursor-pointer"
                                                    onClick={() => toggleSchedule(s)}
                                                >
                                                    {isSelected
                                                        ? <CheckSquare size={20} className="text-primary-600 shrink-0" />
                                                        : <Square size={20} className="text-gray-300 shrink-0" />
                                                    }
                                                    <div className="flex-1 min-w-0">
                                                        <span className="text-sm font-semibold text-gray-900">Cuota #{s.installmentNumber}</span>
                                                        <span className={`ml-2 text-xs ${isOverdue ? 'text-red-500 font-semibold' : 'text-gray-500'}`}>
                                                            {formatDate(s.dueDate)}
                                                            {isOverdue && ' ⚠️ Vencida'}
                                                        </span>
                                                    </div>
                                                    <span className="text-sm font-semibold text-gray-500 line-through shrink-0">
                                                        {formatMoney(defaultAmt)}
                                                    </span>
                                                </div>

                                                {/* Campo de monto editable (solo visible si está seleccionada) */}
                                                {isSelected && (
                                                    <div className="px-3 pb-3">
                                                        <label className="block text-xs font-semibold text-gray-600 mb-1">
                                                            Valor a pagar (editable)
                                                        </label>
                                                        <div className="relative">
                                                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 font-medium text-sm">$</span>
                                                            <input
                                                                type="text"
                                                                value={customAmounts[s.id] ?? Math.ceil(defaultAmt).toLocaleString('es-CO')}
                                                                onChange={(e) => {
                                                                    const raw = e.target.value.replace(/[^0-9]/g, '');
                                                                    setCustomAmounts((prev) => ({
                                                                        ...prev,
                                                                        [s.id]: raw ? Number(raw).toLocaleString('es-CO') : '',
                                                                    }));
                                                                }}
                                                                onClick={(e) => e.stopPropagation()}
                                                                className="w-full pl-7 pr-3 py-2.5 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 text-gray-900 font-semibold text-sm"
                                                                placeholder={Math.ceil(defaultAmt).toLocaleString('es-CO')}
                                                            />
                                                        </div>
                                                        {Math.abs(diff) > 0 && (
                                                            <div className={`flex items-center gap-1 mt-1 text-xs font-medium ${diff > 0 ? 'text-emerald-600' : 'text-amber-600'}`}>
                                                                {diff > 0
                                                                    ? <><TrendingUp size={12} /> Pagas {formatMoney(diff)} extra → amortiza cuotas futuras</>
                                                                    : <><TrendingDown size={12} /> Pagas {formatMoney(Math.abs(diff))} menos → cuotas futuras aumentan</>
                                                                }
                                                            </div>
                                                        )}
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            )}

                            {/* Resumen del total */}
                            {selectedIds.size > 0 && (
                                <div className="mt-3 space-y-2">
                                    <div className="flex justify-between items-center px-4 py-3 bg-primary-50 border border-primary-200 rounded-xl">
                                        <span className="text-sm font-semibold text-primary-900">Total a registrar:</span>
                                        <span className="text-lg font-bold text-primary-700">{formatMoney(totalSelected)}</span>
                                    </div>
                                    {overpayment > 0 && (
                                        <div className="flex items-center gap-2 px-3 py-2 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-700">
                                            <TrendingUp size={14} />
                                            <span><strong>{formatMoney(overpayment)}</strong> extra reducirán las cuotas futuras proporcionalmente</span>
                                        </div>
                                    )}
                                    {underpayment > 0 && (
                                        <div className="flex items-center gap-2 px-3 py-2 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-700">
                                            <TrendingDown size={14} />
                                            <span><strong>{formatMoney(underpayment)}</strong> pendiente se distribuirá en las demás cuotas</span>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>

                        {/* ── Fecha de pago ── */}
                        <div>
                            <label className="block text-sm font-semibold text-gray-700 mb-1">Fecha de pago</label>
                            <input
                                type="date"
                                value={formData.paymentDate}
                                onChange={(e) => setFormData({ ...formData, paymentDate: e.target.value })}
                                className="w-full px-3 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 text-gray-900"
                            />
                        </div>

                        {/* ── Método de pago ── */}
                        <div>
                            <label className="block text-sm font-semibold text-gray-700 mb-2">Método de pago</label>
                            <div className="grid grid-cols-2 gap-2">
                                {['efectivo', 'transferencia', 'cheque', 'otro'].map((m) => (
                                    <label
                                        key={m}
                                        className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border cursor-pointer transition text-sm font-medium capitalize
                                            ${formData.paymentMethod === m
                                                ? 'bg-primary-50 border-primary-400 text-primary-800'
                                                : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'}`}
                                    >
                                        <input
                                            type="radio"
                                            name="paymentMethod"
                                            value={m}
                                            checked={formData.paymentMethod === m}
                                            onChange={(e) => setFormData({ ...formData, paymentMethod: e.target.value })}
                                            className="sr-only"
                                        />
                                        {m}
                                    </label>
                                ))}
                            </div>
                        </div>

                        {/* ── Notas ── */}
                        <div>
                            <label className="block text-sm font-semibold text-gray-700 mb-1">Notas (opcional)</label>
                            <input
                                type="text"
                                value={formData.notes}
                                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                                className="w-full px-3 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 text-gray-900"
                                placeholder="Observaciones del pago..."
                                maxLength={300}
                            />
                        </div>
                    </div>
                </div>

                {/* ── FOOTER FIJO ── */}
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
                        disabled={isSubmitting || selectedIds.size === 0 || totalSelected <= 0}
                        className="flex-1 flex items-center justify-center gap-2 py-3.5 px-4 bg-primary-600 text-white rounded-2xl hover:bg-primary-700 active:bg-primary-800 transition disabled:opacity-50 disabled:cursor-not-allowed font-semibold text-sm shadow-lg shadow-primary-200"
                    >
                        <Save size={18} />
                        {isSubmitting
                            ? `Guardando...`
                            : `Guardar ${selectedIds.size > 1 ? `${selectedIds.size} Pagos` : 'Pago'}`}
                    </button>
                </div>
            </div>
        </div>
        , document.body);
};

export default PaymentModal;
