import React, { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { registerPayment } from '../../api/payments.api';
import { Save, X } from 'lucide-react';

interface PaymentModalProps {
    creditId: string;
    onClose: () => void;
    onSuccess: () => void;
    maxAmount: number;
    remainingBalance: number;
    paymentSchedule?: any[];
}

const PaymentModal: React.FC<PaymentModalProps> = ({ creditId, onClose, onSuccess, maxAmount, remainingBalance, paymentSchedule = [] }) => {
    const queryClient = useQueryClient();
    const [formData, setFormData] = useState({
        amount: '',
        paymentDate: new Date().toISOString().slice(0, 10),
        paymentMethod: 'efectivo',
        notes: '',
    });
    const [error, setError] = useState('');
    const [selectedScheduleId, setSelectedScheduleId] = useState<string>('');

    const mutation = useMutation({
        mutationFn: registerPayment,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['credit', creditId] });
            queryClient.invalidateQueries({ queryKey: ['credits'] });
            onSuccess();
        },
        onError: (err: any) => {
            const errors = err.response?.data?.errors;
            if (Array.isArray(errors) && errors.length > 0) {
                setError(errors[0].msg);
                return;
            }
            setError(err.response?.data?.error || 'Error al registrar pago');
        },
    });

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        const amount = Number(formData.amount.replace(/[^0-9]/g, ''));
        if (!amount || amount < 1000) return setError('El monto debe ser mayor o igual a 1000');
        if (amount > maxAmount) return setError('El monto supera el saldo pendiente');
        mutation.mutate({
            creditId,
            amount,
            paymentDate: formData.paymentDate,
            paymentMethod: formData.paymentMethod || undefined,
            notes: formData.notes || undefined,
            scheduleId: selectedScheduleId || undefined,
        });
    };

    const formatMoney = (val: any) => Math.ceil(Number(val || 0)).toLocaleString('es-CO');

    const coverage = () => {
        let remaining = Number(formData.amount.replace(/[^0-9]/g, ''));
        let covered = 0;
        const sorted = [...paymentSchedule].sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime());
        for (const s of sorted) {
            const pending = Number(s.scheduledAmount) - Number(s.paidAmount);
            if (pending <= 0 || remaining <= 0) continue;
            remaining -= pending;
            covered++;
        }
        return covered;
    };

    const pendingSchedules = paymentSchedule
        .filter((s) => Number(s.scheduledAmount) > Number(s.paidAmount))
        .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime());

    const handleSelectSchedule = (scheduleId: string) => {
        setSelectedScheduleId(scheduleId);
        const sched = pendingSchedules.find((s) => s.id === scheduleId);
        if (sched) {
            const pending = Number(sched.scheduledAmount) - Number(sched.paidAmount || 0);
            setFormData((prev) => ({
                ...prev,
                amount: pending > 0 ? pending.toLocaleString('es-CO') : prev.amount,
            }));
        }
    };

    useEffect(() => {
        if (!selectedScheduleId && pendingSchedules.length > 0) {
            handleSelectSchedule(pendingSchedules[0].id);
        }
    }, [pendingSchedules]);

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg">
                <div className="flex items-center justify-between p-5 border-b">
                    <h3 className="text-lg font-semibold text-gray-800">Registrar Pago</h3>
                    <button onClick={onClose} className="text-gray-500 hover:text-gray-700">
                        <X size={22} />
                    </button>
                </div>
                <form onSubmit={handleSubmit} className="p-5 space-y-4">
                    {error && <div className="bg-red-50 text-red-600 p-3 rounded-md text-sm">{error}</div>}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Monto *</label>
                        <input
                            type="text"
                            value={formData.amount}
                            onChange={(e) => {
                                const raw = e.target.value.replace(/[^0-9]/g, '');
                                const formatted = raw ? Number(raw).toLocaleString('es-CO') : '';
                                setFormData({ ...formData, amount: formatted });
                            }}
                            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
                        />
                        <p className="text-xs text-gray-500 mt-1">Saldo pendiente: ${formatMoney(remainingBalance)}</p>
                        {formData.amount && (
                            <p className="text-xs text-gray-600">Cobertura estimada: {coverage()} cuota(s)</p>
                        )}
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Cuota a pagar</label>
                        <select
                            value={selectedScheduleId}
                            onChange={(e) => handleSelectSchedule(e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
                        >
                            {pendingSchedules.length === 0 && <option value="">No hay cuotas pendientes</option>}
                            {pendingSchedules.map((s) => {
                                const pending = Number(s.scheduledAmount) - Number(s.paidAmount || 0);
                                return (
                                    <option key={s.id} value={s.id}>
                                        {new Date(s.dueDate).toLocaleDateString()} · Pendiente ${pending.toLocaleString('es-CO')}
                                    </option>
                                );
                            })}
                        </select>
                        <p className="text-xs text-gray-500 mt-1">
                            Selecciona la cuota; el monto se autollenará con lo pendiente.
                        </p>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Fecha de pago</label>
                        <input
                            type="date"
                            value={formData.paymentDate}
                            onChange={(e) => setFormData({ ...formData, paymentDate: e.target.value })}
                            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
                        />
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Método</label>
                            <div className="flex flex-wrap gap-3 text-sm text-gray-700">
                                {['efectivo', 'transferencia', 'cheque', 'otro'].map((m) => (
                                    <label key={m} className="inline-flex items-center gap-2">
                                        <input
                                            type="radio"
                                            name="paymentMethod"
                                            value={m}
                                            checked={formData.paymentMethod === m}
                                            onChange={(e) => setFormData({ ...formData, paymentMethod: e.target.value })}
                                        />
                                        <span className="capitalize">{m}</span>
                                    </label>
                                ))}
                            </div>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Notas</label>
                            <input
                                type="text"
                                value={formData.notes}
                                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
                                maxLength={300}
                            />
                        </div>
                    </div>
                    <div className="flex justify-end gap-3 pt-2">
                        <button
                            type="button"
                            onClick={onClose}
                            className="px-4 py-2 text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200"
                        >
                            Cancelar
                        </button>
                        <button
                            type="submit"
                            disabled={mutation.isPending}
                            className="px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700 flex items-center gap-2 disabled:opacity-50"
                        >
                            <Save size={18} />
                            {mutation.isPending ? 'Guardando...' : 'Guardar Pago'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default PaymentModal;
