import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useQueryClient } from '@tanstack/react-query';
import { registerPayment } from '../../api/payments.api';
import { Save, X, CheckSquare, Square } from 'lucide-react';

interface PaymentModalProps {
    creditId: string;
    onClose: () => void;
    onSuccess: () => void;
    maxAmount?: number;
    remainingBalance: number;
    paymentSchedule?: any[];
}

const PaymentModal: React.FC<PaymentModalProps> = ({
    creditId,
    onClose,
    onSuccess,
    remainingBalance,
    paymentSchedule = [],
}) => {
    const queryClient = useQueryClient();
    const [formData, setFormData] = useState({
        paymentDate: new Date().toISOString().slice(0, 10),
        paymentMethod: 'efectivo',
        notes: '',
    });
    const [error, setError] = useState('');
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [isSubmitting, setIsSubmitting] = useState(false);

    const pendingSchedules = [...paymentSchedule]
        .filter((s) => Number(s.scheduledAmount) > Number(s.paidAmount))
        .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime());

    // Auto-seleccionar la primera cuota pendiente
    useEffect(() => {
        if (pendingSchedules.length > 0) {
            setSelectedIds(new Set([pendingSchedules[0].id]));
        }
    }, []);

    const formatMoney = (val: any) => `$${Math.ceil(Number(val || 0)).toLocaleString('es-CO')}`;

    const toggleSchedule = (id: string) => {
        setSelectedIds((prev) => {
            const next = new Set(prev);
            next.has(id) ? next.delete(id) : next.add(id);
            return next;
        });
    };

    const selectAll = () => {
        setSelectedIds(new Set(pendingSchedules.map((s) => s.id)));
    };

    const clearAll = () => {
        setSelectedIds(new Set());
    };

    const totalSelected = pendingSchedules
        .filter((s) => selectedIds.has(s.id))
        .reduce((acc, s) => acc + (Number(s.scheduledAmount) - Number(s.paidAmount || 0)), 0);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');

        if (selectedIds.size === 0) return setError('Selecciona al menos una cuota a pagar');
        if (totalSelected > remainingBalance) return setError('El monto total supera el saldo pendiente');

        const schedulesToPay = pendingSchedules.filter((s) => selectedIds.has(s.id));
        setIsSubmitting(true);

        try {
            // Registrar un pago por cada cuota seleccionada
            for (const s of schedulesToPay) {
                const amount = Number(s.scheduledAmount) - Number(s.paidAmount || 0);
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
                sm:h-auto sm:max-h-[90vh]
                sm:m-auto
            ">
                {/* ── HEADER FIJO ── */}
                <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 bg-white shrink-0">
                    <h3 className="text-lg font-bold text-gray-900">Registrar Pago</h3>
                    <button onClick={onClose} className="p-2 rounded-xl text-gray-500 hover:text-gray-900 hover:bg-gray-100 transition">
                        <X size={22} />
                    </button>
                </div>

                {/* ── CONTENIDO SCROLLABLE ── */}
                <div className="flex-1 overflow-y-auto overscroll-contain">
                    <div className="px-5 pt-4 pb-2 space-y-4">
                        {error && <div className="bg-red-50 text-red-700 border border-red-200 p-3 rounded-xl text-sm">{error}</div>}

                        {/* Selección de cuotas */}
                        <div>
                            <div className="flex items-center justify-between mb-2">
                                <label className="block text-sm font-medium text-primary-900">
                                    Cuotas a pagar <span className="text-primary-600 font-normal">({selectedIds.size} seleccionadas)</span>
                                </label>
                                <div className="flex gap-2 text-xs">
                                    <button type="button" onClick={selectAll} className="text-primary-600 underline hover:text-primary-800">
                                        Todas
                                    </button>
                                    <span className="text-gray-300">|</span>
                                    <button type="button" onClick={clearAll} className="text-gray-500 underline hover:text-gray-700">
                                        Limpiar
                                    </button>
                                </div>
                            </div>

                            {pendingSchedules.length === 0 ? (
                                <p className="text-sm text-gray-500 py-2 text-center border rounded-md bg-slate-50">
                                    No hay cuotas pendientes de pago.
                                </p>
                            ) : (
                                <div className="border border-primary-200 rounded-md overflow-hidden max-h-52 overflow-y-auto">
                                    {pendingSchedules.map((s, idx) => {
                                        const pending = Number(s.scheduledAmount) - Number(s.paidAmount || 0);
                                        const isSelected = selectedIds.has(s.id);
                                        const isOverdue = new Date(s.dueDate) < new Date();
                                        return (
                                            <label
                                                key={s.id}
                                                className={`flex items-center gap-3 px-3 py-2.5 cursor-pointer transition-colors border-b last:border-0
                                                ${isSelected ? 'bg-primary-50' : idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'}
                                                hover:bg-primary-50/70`}
                                            >
                                                <input
                                                    type="checkbox"
                                                    checked={isSelected}
                                                    onChange={() => toggleSchedule(s.id)}
                                                    className="sr-only"
                                                />
                                                {isSelected
                                                    ? <CheckSquare size={18} className="text-primary-600 shrink-0" />
                                                    : <Square size={18} className="text-gray-300 shrink-0" />
                                                }
                                                <div className="flex-1 min-w-0">
                                                    <span className="text-sm font-medium text-gray-800">
                                                        Cuota #{s.installmentNumber}
                                                    </span>
                                                    <span className={`ml-2 text-xs ${isOverdue ? 'text-danger-500 font-semibold' : 'text-gray-500'}`}>
                                                        {new Date(s.dueDate).toLocaleDateString('es-CO')}
                                                        {isOverdue && ' (Vencida)'}
                                                    </span>
                                                </div>
                                                <span className="text-sm font-semibold text-gray-900 shrink-0">
                                                    {formatMoney(pending)}
                                                </span>
                                            </label>
                                        );
                                    })}
                                </div>
                            )}

                            {/* Total a pagar */}
                            {selectedIds.size > 0 && (
                                <div className="mt-2 flex justify-between items-center px-3 py-2 bg-primary-50 border border-primary-200 rounded-md">
                                    <span className="text-sm font-medium text-primary-900">Total a registrar:</span>
                                    <span className="text-base font-bold text-primary-700">{formatMoney(totalSelected)}</span>
                                </div>
                            )}
                            <p className="text-xs text-primary-600 mt-1">
                                Saldo pendiente total: <strong>{formatMoney(remainingBalance)}</strong>
                            </p>
                        </div>

                        {/* Fecha */}
                        <div>
                            <label className="block text-sm font-medium text-primary-900 mb-1">Fecha de pago</label>
                            <input
                                type="date"
                                value={formData.paymentDate}
                                onChange={(e) => setFormData({ ...formData, paymentDate: e.target.value })}
                                className="w-full px-3 py-2 border border-primary-200 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500 text-gray-900"
                            />
                        </div>

                        {/* Método */}
                        <div>
                            <label className="block text-sm font-medium text-primary-900 mb-2">Método de pago</label>
                            <div className="flex flex-wrap gap-3 text-sm text-primary-900">
                                {['efectivo', 'transferencia', 'cheque', 'otro'].map((m) => (
                                    <label key={m} className="inline-flex items-center gap-2 cursor-pointer">
                                        <input
                                            type="radio"
                                            name="paymentMethod"
                                            value={m}
                                            checked={formData.paymentMethod === m}
                                            onChange={(e) => setFormData({ ...formData, paymentMethod: e.target.value })}
                                            className="rounded border-primary-300 text-primary-600"
                                        />
                                        <span className="capitalize">{m}</span>
                                    </label>
                                ))}
                            </div>
                        </div>

                        {/* Notas */}
                        <div>
                            <label className="block text-sm font-medium text-primary-900 mb-1">Notas (opcional)</label>
                            <input
                                type="text"
                                value={formData.notes}
                                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                                className="w-full px-3 py-2 border border-primary-200 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500 text-gray-900"
                                placeholder="Observaciones del pago..."
                                maxLength={300}
                            />
                        </div>
                    </div>
                </div>{/* fin scrollable */}

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
                        onClick={(e) => handleSubmit(e as any)}
                        disabled={isSubmitting || selectedIds.size === 0}
                        className="flex-1 flex items-center justify-center gap-2 py-3.5 px-4 bg-primary-600 text-white rounded-2xl hover:bg-primary-700 active:bg-primary-800 transition disabled:opacity-50 disabled:cursor-not-allowed font-semibold text-sm shadow-lg shadow-primary-200"
                    >
                        <Save size={18} />
                        {isSubmitting
                            ? `Guardando ${selectedIds.size} pago(s)...`
                            : `Guardar ${selectedIds.size > 1 ? `${selectedIds.size} Pagos` : 'Pago'}`}
                    </button>
                </div>
            </div>
        </div>
        , document.body);
};

export default PaymentModal;

