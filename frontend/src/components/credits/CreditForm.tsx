import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '../../store/authStore';
import { getBusinesses } from '../../api/business.api';
import { searchClients, getClients } from '../../api/clients.api';
import { createCredit, simulateCredit, CreditSimulation } from '../../api/credits.api';
import { Client, PaymentFrequency } from '../../types';
import { Search, Calculator, Save, X, Download } from 'lucide-react';
import jsPDF from 'jspdf';

interface CreditFormProps {
    onClose: () => void;
    onCreated: (id: string) => void;
    selectedBusinessId?: string;
}

const frequencies: { value: PaymentFrequency; label: string }[] = [
    { value: 'daily', label: 'Diario' },
    { value: 'weekly', label: 'Semanal' },
    { value: 'biweekly', label: 'Quincenal' },
    { value: 'monthly', label: 'Mensual' },
];

const formatMoney = (value: any) => Math.ceil(Number(value || 0)).toLocaleString('es-CO');
const gapDaysMap: Record<PaymentFrequency, number> = {
    daily: 1,
    weekly: 7,
    biweekly: 15,
    monthly: 30,
};
const DAYS_PER_MONTH = 28;

const CreditForm: React.FC<CreditFormProps> = ({ onClose, onCreated, selectedBusinessId }) => {
    const { user } = useAuthStore();
    const queryClient = useQueryClient();

    const [clientSearch, setClientSearch] = useState('');
    const [selectedClientId, setSelectedClientId] = useState<string>('');
    const [selectedClient, setSelectedClient] = useState<Client | null>(null);
    const [formError, setFormError] = useState('');
    const [simulation, setSimulation] = useState<CreditSimulation | null>(null);
    const [formData, setFormData] = useState({
        amount: '',
        interestRate: '',
        termMonths: '',
        frequency: 'weekly' as PaymentFrequency,
        startDate: new Date().toISOString().slice(0, 10),
        businessId: selectedBusinessId || '',
    });
    const [useFixedInstallment, setUseFixedInstallment] = useState(false);
    const [installmentAmount, setInstallmentAmount] = useState('');

    const isSuperAdmin = user?.role === 'super_admin';

    const { data: businesses } = useQuery({
        queryKey: ['businesses'],
        queryFn: getBusinesses,
        enabled: isSuperAdmin,
    });

    useEffect(() => {
        if (isSuperAdmin && businesses && businesses.length > 0 && !formData.businessId) {
            setFormData((prev) => ({ ...prev, businessId: businesses[0].id }));
        }
    }, [businesses, formData.businessId, isSuperAdmin]);

    useEffect(() => {
        if (isSuperAdmin && selectedBusinessId) {
            setFormData((prev) => ({ ...prev, businessId: selectedBusinessId }));
            setClientSearch('');
            setSelectedClientId('');
            setSelectedClient(null);
        }
    }, [selectedBusinessId, isSuperAdmin]);

    const { data: clientResults } = useQuery({
        queryKey: ['clients', 'search', clientSearch, formData.businessId],
        queryFn: () => searchClients(clientSearch, formData.businessId),
        enabled: clientSearch.length > 2,
    });

    const { data: clientList } = useQuery({
        queryKey: ['clients', 'list', formData.businessId],
        queryFn: () => getClients(formData.businessId),
        enabled: isSuperAdmin ? !!formData.businessId : true,
    });

    const simulateMutation = useMutation({
        mutationFn: simulateCredit,
        onSuccess: (data) => setSimulation(data),
        onError: (err: any) => setFormError(err.response?.data?.error || 'Error al simular crédito'),
    });

    const estimateTermDays = (amount: number, interestRate: number, installment: number, frequency: PaymentFrequency) => {
        const gap = gapDaysMap[frequency] || 7;
        const estimatedTotal = amount + amount * (interestRate / 100);
        const payments = Math.max(1, Math.ceil(estimatedTotal / installment));
        return payments * gap;
    };

    const createMutation = useMutation({
        mutationFn: createCredit,
        onSuccess: (credit) => {
            queryClient.invalidateQueries({ queryKey: ['credits'] });
            onCreated(credit.id);
        },
        onError: (err: any) => {
            const errors = err.response?.data?.errors;
            if (Array.isArray(errors) && errors.length > 0) {
                setFormError(errors[0].msg);
                return;
            }
            setFormError(err.response?.data?.error || 'Error al crear el crédito');
        },
    });

    const handleSimulate = () => {
        setFormError('');
        if (!selectedClientId) return setFormError('Selecciona un cliente');
        const amount = Number(formData.amount.replace(/[^0-9]/g, ''));
        const interestRate = Number(formData.interestRate);
        const installment = Number(installmentAmount.replace(/[^0-9]/g, ''));
        let termDays = Number(formData.termMonths) * DAYS_PER_MONTH;

        if (useFixedInstallment) {
            if (Number.isNaN(installment) || installment <= 0) return setFormError('Ingresa una cuota válida');
            termDays = estimateTermDays(amount, interestRate, installment, formData.frequency);
        }

        if (Number.isNaN(amount) || amount <= 0 || Number.isNaN(interestRate) || interestRate <= 0 || Number.isNaN(termDays) || termDays <= 0) {
            return setFormError('Completa monto, interés y plazo');
        }
        simulateMutation.mutate({
            amount,
            interestRate,
            termDays,
            frequency: formData.frequency,
            startDate: formData.startDate,
        });
    };

    const handleSubmit = (e?: React.FormEvent) => {
        e?.preventDefault();
        setFormError('');
        if (!selectedClientId) return setFormError('Selecciona un cliente');
        const amount = Number(formData.amount.replace(/[^0-9]/g, ''));
        const interestRate = Number(formData.interestRate);
        const installment = Number(installmentAmount.replace(/[^0-9]/g, ''));
        let termDays = Number(formData.termMonths) * DAYS_PER_MONTH;

        if (useFixedInstallment) {
            if (Number.isNaN(installment) || installment <= 0) return setFormError('Ingresa una cuota válida');
            termDays = estimateTermDays(amount, interestRate, installment, formData.frequency);
        }

        if (Number.isNaN(amount) || amount <= 0 || Number.isNaN(interestRate) || interestRate <= 0 || Number.isNaN(termDays) || termDays <= 0) {
            return setFormError('Monto, interés y plazo deben ser mayores a 0');
        }
        if (isSuperAdmin && !formData.businessId) {
            return setFormError('Selecciona un negocio');
        }
        createMutation.mutate({
            clientId: selectedClientId,
            amount,
            interestRate,
            termDays,
            frequency: formData.frequency,
            startDate: formData.startDate,
            businessId: formData.businessId || undefined,
        });
    };

    const handleSelectClient = (client: Client) => {
        setSelectedClientId(client.id);
        setSelectedClient(client);
        setClientSearch(`${client.fullName} (${client.phone})`);
    };

    const handleDownloadPDF = () => {
        if (!simulation) return;
        const doc = new jsPDF();
        const startY = 20;
        doc.setFontSize(14);
        doc.text('Cotización de Crédito', 14, startY);
        doc.setFontSize(10);
        doc.text(`Cliente: ${selectedClient?.fullName || ''}`, 14, startY + 8);
        doc.text(`Documento: ${selectedClient?.cedula || ''}  Tel: ${selectedClient?.phone || ''}`, 14, startY + 14);
        doc.text(`Monto: $${formData.amount}  Interés: ${formData.interestRate}%  Plazo: ${formData.termMonths} meses`, 14, startY + 20);
        doc.text(`Frecuencia: ${formData.frequency}  Fecha inicio: ${formData.startDate}`, 14, startY + 26);
        doc.text(`Total con interés: $${formatMoney(simulation.totalWithInterest)}`, 14, startY + 34);
        doc.text(`Cuota estimada: $${formatMoney(simulation.paymentAmount)}  Cuotas: ${simulation.numberOfPayments}`, 14, startY + 40);

        let y = startY + 50;
        doc.text('#', 14, y); doc.text('Día', 24, y); doc.text('Fecha', 54, y); doc.text('Monto', 104, y);
        y += 6;
        paymentPlanView.forEach((p, idx) => {
            const dueDate = p.dueDate ? new Date(p.dueDate) : null;
            const due = dueDate ? dueDate.toLocaleDateString() : '-';
            const day = dueDate ? new Intl.DateTimeFormat('es-CO', { weekday: 'long' }).format(dueDate) : '-';
            const amount = p.scheduledAmount ? formatMoney(p.scheduledAmount) : '-';
            doc.text(String(p.installmentNumber ?? idx + 1), 14, y);
            doc.text(day, 24, y); doc.text(due, 54, y);
            doc.text(amount === '-' ? '-' : `$${amount}`, 104, y);
            y += 6;
            if (y > 280) { doc.addPage(); y = 20; }
        });
        doc.save('cotizacion-credito.pdf');
    };

    const isLoading = simulateMutation.isPending || createMutation.isPending;

    const derivedTermInfo = useMemo(() => {
        const amount = Number(formData.amount.replace(/[^0-9]/g, ''));
        const interestRate = Number(formData.interestRate);
        const installment = Number(installmentAmount.replace(/[^0-9]/g, ''));
        if (useFixedInstallment && amount > 0 && interestRate > 0 && installment > 0) {
            const termDays = estimateTermDays(amount, interestRate, installment, formData.frequency);
            return { termDays, termMonths: Math.ceil(termDays / 30) };
        }
        return null;
    }, [formData.amount, formData.frequency, formData.interestRate, installmentAmount, useFixedInstallment]);

    const paymentPlanView = useMemo(() => {
        if (!simulation) return [];
        if (Array.isArray(simulation.paymentPlan) && simulation.paymentPlan.length > 0) {
            return simulation.paymentPlan.map((p, idx) => ({
                installmentNumber: p.installmentNumber ?? idx + 1,
                dueDate: p.dueDate,
                scheduledAmount: Number(p.scheduledAmount),
            }));
        }
        const start = formData.startDate ? new Date(formData.startDate) : new Date();
        const daysMap: Record<PaymentFrequency, number> = { daily: 1, weekly: 7, biweekly: 15, monthly: 30 };
        const gap = daysMap[formData.frequency] ?? 7;
        const count = Number(simulation.numberOfPayments) || 0;
        const schedAmount = Number(simulation.paymentAmount) || 0;
        return Array.from({ length: count }).map((_, idx) => {
            const due = new Date(start);
            due.setDate(start.getDate() + gap * (idx + 1));
            return { installmentNumber: idx + 1, dueDate: due.toISOString(), scheduledAmount: schedAmount };
        });
    }, [formData.frequency, formData.startDate, simulation]);

    return createPortal(
        /* Overlay al nivel del body: nunca tapado por bottom nav ni layout */
        <div className="fixed inset-0 z-[9999] flex flex-col bg-black/60">
            {/* En móvil: pantalla completa. En desktop: modal centrado */}
            <div className="
                flex flex-col bg-white w-full h-full
                sm:rounded-xl sm:shadow-2xl sm:w-full sm:max-w-4xl
                sm:h-auto sm:max-h-[90vh]
                sm:m-auto
            ">
                {/* ── HEADER FIJO ── */}
                <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 bg-white shrink-0">
                    <div>
                        <h2 className="text-lg font-bold text-gray-900">Nuevo Crédito</h2>
                        <p className="text-sm text-primary-600">Crea el crédito y genera su plan de pagos</p>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 rounded-xl text-gray-500 hover:text-gray-900 hover:bg-gray-100 transition"
                    >
                        <X size={22} />
                    </button>
                </div>

                {/* ── CONTENIDO SCROLLABLE ── */}
                <div className="flex-1 overflow-y-auto overscroll-contain">
                    <div className="px-5 py-4 space-y-5">
                        {formError && (
                            <div className="bg-red-50 border border-red-200 text-red-700 p-3 rounded-xl text-sm">{formError}</div>
                        )}

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {/* Cliente */}
                            <div className="md:col-span-2 space-y-2">
                                <label className="block text-sm font-semibold text-gray-700">Cliente *</label>
                                <select
                                    value={selectedClientId}
                                    onChange={(e) => {
                                        const found = clientList?.find((c) => c.id === e.target.value);
                                        if (found) handleSelectClient(found);
                                        else setSelectedClientId(e.target.value);
                                    }}
                                    className="w-full px-3 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 bg-white text-gray-900"
                                >
                                    <option value="">Seleccione un cliente</option>
                                    {clientList?.map((c) => (
                                        <option key={c.id} value={c.id}>{c.fullName} ({c.phone})</option>
                                    ))}
                                </select>
                                <div className="relative">
                                    <input
                                        type="text"
                                        value={clientSearch}
                                        onChange={(e) => {
                                            setClientSearch(e.target.value);
                                            if (e.target.value === '') setSelectedClientId('');
                                        }}
                                        className="w-full px-3 py-3 pl-10 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 text-gray-900"
                                        placeholder="O busca por nombre / celular..."
                                    />
                                    <Search className="absolute left-3 top-3.5 text-gray-400" size={18} />
                                </div>
                                {clientSearch.length > 2 && clientResults && clientResults.length > 0 && (
                                    <div className="mt-1 bg-white border border-gray-200 rounded-xl shadow-lg max-h-40 overflow-y-auto">
                                        {clientResults.map((c) => (
                                            <button
                                                key={c.id}
                                                type="button"
                                                onClick={() => handleSelectClient(c)}
                                                className={`w-full text-left px-4 py-3 hover:bg-primary-50 border-b last:border-0 ${selectedClientId === c.id ? 'bg-primary-50' : ''}`}
                                            >
                                                <div className="font-medium text-gray-900">{c.fullName}</div>
                                                <div className="text-xs text-gray-500">{c.phone} - {c.cedula}</div>
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>

                            {/* Negocio */}
                            {isSuperAdmin && (
                                <div>
                                    <label className="block text-sm font-semibold text-gray-700 mb-1">Negocio *</label>
                                    <select
                                        value={formData.businessId}
                                        onChange={(e) => setFormData({ ...formData, businessId: e.target.value })}
                                        className="w-full px-3 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 bg-white text-gray-900"
                                    >
                                        <option value="">Seleccione negocio</option>
                                        {businesses?.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                                    </select>
                                </div>
                            )}

                            {/* Monto */}
                            <div>
                                <label className="block text-sm font-semibold text-gray-700 mb-1">Monto *</label>
                                <input
                                    type="text"
                                    value={formData.amount}
                                    onChange={(e) => {
                                        const raw = e.target.value.replace(/[^0-9]/g, '');
                                        setFormData({ ...formData, amount: raw ? Number(raw).toLocaleString('es-CO') : '' });
                                    }}
                                    className="w-full px-3 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 text-gray-900"
                                    placeholder="0"
                                />
                            </div>

                            {/* Interés */}
                            <div>
                                <label className="block text-sm font-semibold text-gray-700 mb-1">Interés (%) *</label>
                                <input
                                    type="number"
                                    value={formData.interestRate}
                                    onChange={(e) => setFormData({ ...formData, interestRate: e.target.value })}
                                    className="w-full px-3 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 text-gray-900"
                                    min="0" step="0.01" placeholder="0"
                                />
                            </div>

                            {/* Cuota fija */}
                            <div className="md:col-span-2 bg-gray-50 border border-gray-200 rounded-xl p-4 space-y-3">
                                <label className="flex items-center gap-3 cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={useFixedInstallment}
                                        onChange={(e) => setUseFixedInstallment(e.target.checked)}
                                        className="w-5 h-5 rounded border-gray-300 text-primary-600"
                                    />
                                    <span className="text-sm font-medium text-gray-800">Usar cuota fija (ingresa la cuota deseada en COP)</span>
                                </label>
                                <div>
                                    <label className="block text-sm font-semibold text-primary-700 mb-1">Cuota deseada</label>
                                    <input
                                        type="text"
                                        value={installmentAmount}
                                        onChange={(e) => {
                                            const raw = e.target.value.replace(/[^0-9]/g, '');
                                            setInstallmentAmount(raw ? Number(raw).toLocaleString('es-CO') : '');
                                        }}
                                        className="w-full px-3 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 text-gray-900 disabled:bg-gray-100 disabled:text-gray-400"
                                        placeholder="Ej: 100.000"
                                        disabled={!useFixedInstallment}
                                    />
                                    <p className="text-xs text-primary-600 mt-1">Recalcularemos el plazo estimado según esta cuota.</p>
                                </div>
                                {derivedTermInfo && (
                                    <div className="text-sm text-primary-900 bg-primary-50 rounded-lg p-3">
                                        <strong>Plazo estimado:</strong> {derivedTermInfo.termMonths} meses ({derivedTermInfo.termDays} días)
                                    </div>
                                )}
                            </div>

                            {/* Plazo */}
                            <div>
                                <label className="block text-sm font-semibold text-gray-700 mb-1">Plazo (meses) *</label>
                                <input
                                    type="number"
                                    value={formData.termMonths}
                                    onChange={(e) => setFormData({ ...formData, termMonths: e.target.value })}
                                    className="w-full px-3 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 text-gray-900"
                                    min="1" placeholder="1"
                                />
                                <p className="text-xs text-gray-500 mt-1">Si usas cuota fija, el plazo se recalcula automáticamente.</p>
                            </div>

                            {/* Frecuencia */}
                            <div>
                                <label className="block text-sm font-semibold text-gray-700 mb-1">Frecuencia *</label>
                                <select
                                    value={formData.frequency}
                                    onChange={(e) => setFormData({ ...formData, frequency: e.target.value as PaymentFrequency })}
                                    className="w-full px-3 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 bg-white text-gray-900"
                                >
                                    {frequencies.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
                                </select>
                            </div>

                            {/* Fecha inicio */}
                            <div className="md:col-span-2">
                                <label className="block text-sm font-semibold text-gray-700 mb-1">Fecha de inicio</label>
                                <input
                                    type="date"
                                    value={formData.startDate}
                                    onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
                                    className="w-full px-3 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 text-gray-900"
                                />
                            </div>
                        </div>

                        {/* Tabla de simulación */}
                        {simulation && (
                            <div className="border border-gray-200 rounded-xl p-4 bg-gray-50 space-y-3">
                                <div className="flex flex-wrap gap-4 text-sm text-gray-800">
                                    <span><strong>Total con interés:</strong> ${formatMoney(simulation.totalWithInterest)}</span>
                                    <span><strong>Cuota estimada:</strong> ${formatMoney(simulation.paymentAmount)}</span>
                                    <span><strong>Cuotas:</strong> {simulation.numberOfPayments}</span>
                                </div>
                                <button
                                    type="button"
                                    onClick={handleDownloadPDF}
                                    className="inline-flex items-center gap-2 px-3 py-2 border border-primary-600 text-primary-700 bg-white rounded-lg text-sm font-medium hover:bg-primary-50 transition"
                                >
                                    <Download size={16} /> Descargar PDF
                                </button>
                                <div className="max-h-48 overflow-y-auto bg-white rounded-lg border border-gray-200">
                                    <table className="w-full text-left text-sm">
                                        <thead className="bg-gray-50 text-gray-600 sticky top-0">
                                            <tr>
                                                <th className="py-2 px-3">#</th>
                                                <th className="py-2 px-3 hidden sm:table-cell">Día</th>
                                                <th className="py-2 px-3">Fecha</th>
                                                <th className="py-2 px-3">Monto</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y">
                                            {paymentPlanView.map((p, idx) => {
                                                const dueDate = p.dueDate ? new Date(p.dueDate) : null;
                                                const due = dueDate ? dueDate.toLocaleDateString() : '-';
                                                const day = dueDate ? new Intl.DateTimeFormat('es-CO', { weekday: 'short' }).format(dueDate) : '-';
                                                const amount = p.scheduledAmount ? formatMoney(p.scheduledAmount) : '-';
                                                return (
                                                    <tr key={p.installmentNumber || idx} className="text-gray-800">
                                                        <td className="py-2 px-3">{p.installmentNumber ?? idx + 1}</td>
                                                        <td className="py-2 px-3 capitalize hidden sm:table-cell">{day}</td>
                                                        <td className="py-2 px-3">{due}</td>
                                                        <td className="py-2 px-3">{amount === '-' ? '-' : `$${amount}`}</td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                {/* ── FOOTER FIJO - SIEMPRE VISIBLE ── */}
                <div className="shrink-0 border-t border-gray-200 bg-white px-5 py-4 flex gap-3">
                    <button
                        type="button"
                        onClick={handleSimulate}
                        disabled={isLoading}
                        className="flex-1 flex items-center justify-center gap-2 py-3.5 px-4 bg-gray-100 text-gray-800 rounded-2xl hover:bg-gray-200 active:bg-gray-300 transition font-semibold text-sm disabled:opacity-50"
                    >
                        <Calculator size={18} />
                        Simular
                    </button>
                    <button
                        type="button"
                        onClick={() => handleSubmit()}
                        disabled={isLoading}
                        className="flex-1 flex items-center justify-center gap-2 py-3.5 px-4 bg-primary-600 text-white rounded-2xl hover:bg-primary-700 active:bg-primary-800 transition font-semibold text-sm disabled:opacity-50 shadow-lg shadow-primary-200"
                    >
                        <Save size={18} />
                        {isLoading ? 'Guardando...' : 'Guardar Crédito'}
                    </button>
                </div>
            </div>
        </div>
        , document.body);
};

export default CreditForm;
