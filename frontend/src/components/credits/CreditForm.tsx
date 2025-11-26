import React, { useEffect, useMemo, useState } from 'react';
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
const DAYS_PER_MONTH = 28; // se considera 1 mes = 4 semanas

const CreditForm: React.FC<CreditFormProps> = ({ onClose, onCreated }) => {
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
        businessId: '',
    });
    const [useFixedInstallment, setUseFixedInstallment] = useState(false);
    const [installmentAmount, setInstallmentAmount] = useState('');

    const isAdmin = ['admin', 'super_admin'].includes(user?.role || '');

    const { data: businesses } = useQuery({
        queryKey: ['businesses'],
        queryFn: getBusinesses,
        enabled: isAdmin,
    });

    // Autoseleccionar negocio para admin
    useEffect(() => {
        if (isAdmin && businesses && businesses.length > 0 && !formData.businessId) {
            setFormData((prev) => ({ ...prev, businessId: businesses[0].id }));
        }
    }, [businesses, formData.businessId, isAdmin]);

    const { data: clientResults } = useQuery({
        queryKey: ['clients', 'search', clientSearch, formData.businessId],
        queryFn: () => searchClients(clientSearch, formData.businessId),
        enabled: clientSearch.length > 2,
    });

    const { data: clientList } = useQuery({
        queryKey: ['clients', 'list', formData.businessId],
        queryFn: () => getClients(formData.businessId),
        enabled: isAdmin ? !!formData.businessId : true,
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

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
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
        if (isAdmin && !formData.businessId) {
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
        doc.text('#', 14, y);
        doc.text('Día', 24, y);
        doc.text('Fecha', 54, y);
        doc.text('Monto', 104, y);
        y += 6;
        paymentPlanView.forEach((p, idx) => {
            const dueDate = p.dueDate ? new Date(p.dueDate) : null;
            const due = dueDate ? dueDate.toLocaleDateString() : '-';
            const day = dueDate
                ? new Intl.DateTimeFormat('es-CO', { weekday: 'long' }).format(dueDate)
                : '-';
            const amount = p.scheduledAmount ? formatMoney(p.scheduledAmount) : '-';
            doc.text(String(p.installmentNumber ?? idx + 1), 14, y);
            doc.text(day, 24, y);
            doc.text(due, 54, y);
            doc.text(amount === '-' ? '-' : `$${amount}`, 104, y);
            y += 6;
            if (y > 280) {
                doc.addPage();
                y = 20;
            }
        });

        doc.save('cotizacion-credito.pdf');
    };

    const isLoading = simulateMutation.isPending || createMutation.isPending;

    const simulationTotal = useMemo(() => {
        if (!simulation) return null;
        return {
            total: simulation.totalWithInterest,
            cuota: simulation.paymentAmount,
            cuotas: simulation.numberOfPayments,
        };
    }, [simulation]);

    const derivedTermInfo = useMemo(() => {
        const amount = Number(formData.amount.replace(/[^0-9]/g, ''));
        const interestRate = Number(formData.interestRate);
        const installment = Number(installmentAmount.replace(/[^0-9]/g, ''));
        if (useFixedInstallment && amount > 0 && interestRate > 0 && installment > 0) {
            const termDays = estimateTermDays(amount, interestRate, installment, formData.frequency);
            return {
                termDays,
                termMonths: Math.ceil(termDays / 30),
            };
        }
        return null;
    }, [formData.amount, formData.frequency, formData.interestRate, installmentAmount, useFixedInstallment]);

    const paymentPlanView = useMemo(() => {
        if (!simulation) return [];

        // Usar plan del backend si viene poblado
        if (Array.isArray(simulation.paymentPlan) && simulation.paymentPlan.length > 0) {
            return simulation.paymentPlan.map((p, idx) => ({
                installmentNumber: p.installmentNumber ?? idx + 1,
                dueDate: p.dueDate,
                scheduledAmount: Number(p.scheduledAmount),
            }));
        }

        // Fallback: generar plan en frontend para evitar tabla vacía
        const start = formData.startDate ? new Date(formData.startDate) : new Date();
        const daysMap: Record<PaymentFrequency, number> = {
            daily: 1,
            weekly: 7,
            biweekly: 15,
            monthly: 30,
        };
        const gap = daysMap[formData.frequency] ?? 7;
        const count = Number(simulation.numberOfPayments) || 0;
        const schedAmount = Number(simulation.paymentAmount) || 0;

        return Array.from({ length: count }).map((_, idx) => {
            const due = new Date(start);
            due.setDate(start.getDate() + gap * (idx + 1));
            return {
                installmentNumber: idx + 1,
                dueDate: due.toISOString(),
                scheduledAmount: schedAmount,
            };
        });
    }, [formData.frequency, formData.startDate, simulation]);

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-y-auto">
                <div className="flex items-center justify-between p-6 border-b">
                    <div>
                        <h2 className="text-xl font-semibold text-gray-800">Nuevo Crédito</h2>
                        <p className="text-sm text-gray-500">Crea el crédito y genera su plan de pagos</p>
                    </div>
                    <button onClick={onClose} className="text-gray-500 hover:text-gray-700">
                        <X size={24} />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="p-6 space-y-6">
                    {formError && (
                        <div className="bg-red-50 text-red-600 p-3 rounded-md text-sm">{formError}</div>
                    )}

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {/* Cliente */}
                        <div className="md:col-span-2 space-y-2">
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                Cliente *
                            </label>
                            <select
                                value={selectedClientId}
                                onChange={(e) => {
                                    const found = clientList?.find((c) => c.id === e.target.value);
                                    if (found) handleSelectClient(found);
                                    else setSelectedClientId(e.target.value);
                                }}
                                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
                            >
                                <option value="">Seleccione un cliente</option>
                                {clientList?.map((c) => (
                                    <option key={c.id} value={c.id}>
                                        {c.fullName} ({c.phone})
                                    </option>
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
                                    className="w-full px-3 py-2 pl-10 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
                                    placeholder="Buscar por nombre o celular..."
                                />
                                <Search className="absolute left-3 top-2.5 text-gray-400" size={18} />
                            </div>
                            {clientSearch.length > 2 && clientResults && clientResults.length > 0 && (
                                <div className="mt-1 bg-white border border-gray-200 rounded-md shadow-lg max-h-40 overflow-y-auto">
                                    {clientResults.map((c) => (
                                        <button
                                            key={c.id}
                                            type="button"
                                            onClick={() => {
                                                handleSelectClient(c);
                                            }}
                                            className={`w-full text-left px-4 py-2 hover:bg-gray-50 ${selectedClientId === c.id ? 'bg-primary-50' : ''}`}
                                        >
                                            <div className="font-medium">{c.fullName}</div>
                                            <div className="text-xs text-gray-500">{c.phone} - {c.cedula}</div>
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* Negocio */}
                        {isAdmin && (
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    Negocio *
                                </label>
                                <select
                                    value={formData.businessId}
                                    onChange={(e) => setFormData({ ...formData, businessId: e.target.value })}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
                                >
                                    <option value="">Seleccione negocio</option>
                                    {businesses?.map((b) => (
                                        <option key={b.id} value={b.id}>{b.name}</option>
                                    ))}
                                </select>
                            </div>
                        )}

                        {/* Monto */}
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
                        </div>

                        {/* Interés */}
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Interés (%) *</label>
                            <input
                                type="number"
                                value={formData.interestRate}
                                onChange={(e) => setFormData({ ...formData, interestRate: e.target.value })}
                                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
                                min="0"
                                step="0.01"
                            />
                        </div>

                        {/* Cuota deseada (opcional) */}
                        <div className="md:col-span-2 bg-gray-50 border border-gray-200 rounded-md p-3 space-y-2">
                            <div className="flex items-center gap-2">
                                <input
                                    type="checkbox"
                                    checked={useFixedInstallment}
                                    onChange={(e) => setUseFixedInstallment(e.target.checked)}
                                    className="w-4 h-4 text-primary-600 border-gray-300 rounded"
                                />
                                <span className="text-sm text-gray-800">Usar cuota fija (ingresa la cuota deseada en COP)</span>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 items-end">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Cuota deseada</label>
                                    <input
                                        type="text"
                                        value={installmentAmount}
                                        onChange={(e) => {
                                            const raw = e.target.value.replace(/[^0-9]/g, '');
                                            const formatted = raw ? Number(raw).toLocaleString('es-CO') : '';
                                            setInstallmentAmount(formatted);
                                        }}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
                                        placeholder="Ej: 100.000"
                                        disabled={!useFixedInstallment}
                                    />
                                    <p className="text-xs text-gray-500 mt-1">Recalcularemos el plazo estimado según esta cuota.</p>
                                </div>
                                {derivedTermInfo && (
                                    <div className="text-sm text-gray-700">
                                        <p><strong>Plazo estimado:</strong> {derivedTermInfo.termMonths} meses ({derivedTermInfo.termDays} días)</p>
                                        <p className="text-gray-500">Basado en la cuota deseada.</p>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Plazo */}
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Plazo (meses) *</label>
                            <input
                                type="number"
                                value={formData.termMonths}
                                onChange={(e) => setFormData({ ...formData, termMonths: e.target.value })}
                                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
                                min="1"
                            />
                            <p className="text-xs text-gray-500 mt-1">Si usas cuota fija, el plazo se recalcula automáticamente.</p>
                        </div>

                        {/* Frecuencia */}
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Frecuencia *</label>
                            <select
                                value={formData.frequency}
                                onChange={(e) => setFormData({ ...formData, frequency: e.target.value as PaymentFrequency })}
                                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
                            >
                                {frequencies.map((f) => (
                                    <option key={f.value} value={f.value}>{f.label}</option>
                                ))}
                            </select>
                        </div>

                        {/* Fecha inicio */}
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Fecha de inicio</label>
                            <input
                                type="date"
                                value={formData.startDate}
                                onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
                                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
                            />
                        </div>
                    </div>

                    <div className="flex items-center gap-3">
                        <button
                            type="button"
                            onClick={handleSimulate}
                            disabled={isLoading}
                            className="flex items-center gap-2 px-4 py-2 bg-gray-100 text-gray-800 rounded-md hover:bg-gray-200 transition disabled:opacity-50"
                        >
                            <Calculator size={18} /> Simular
                        </button>
                        <button
                            type="submit"
                            disabled={isLoading}
                            className="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700 transition disabled:opacity-50"
                        >
                            <Save size={18} /> {isLoading ? 'Guardando...' : 'Guardar Crédito'}
                        </button>
                    </div>

                    {simulation && (
                        <div className="border rounded-lg p-4 bg-gray-50 space-y-4">
                            <div className="flex flex-col gap-2 text-sm text-gray-700 md:flex-row md:items-center md:justify-between">
                                <div className="flex flex-wrap gap-4">
                                    <span><strong>Cliente:</strong> {selectedClient?.fullName || clientSearch}</span>
                                    <span><strong>Documento:</strong> {selectedClient?.cedula || '-'}</span>
                                    <span><strong>Tel:</strong> {selectedClient?.phone || '-'}</span>
                                </div>
                                <button
                                    type="button"
                                    onClick={handleDownloadPDF}
                                    className="inline-flex items-center gap-2 px-3 py-2 border border-primary-600 text-primary-700 bg-white rounded-md text-sm font-medium hover:bg-primary-50 transition"
                                >
                                    <Download size={16} /> Descargar PDF
                                </button>
                            </div>
                            <div className="flex flex-wrap gap-4 text-sm text-gray-700">
                                <span><strong>Total con interés:</strong> ${formatMoney(simulation.totalWithInterest)}</span>
                                <span><strong>Cuota estimada:</strong> ${formatMoney(simulation.paymentAmount)}</span>
                                <span><strong>Cuotas:</strong> {simulation.numberOfPayments}</span>
                                {derivedTermInfo && (
                                    <span><strong>Plazo estimado:</strong> {derivedTermInfo.termMonths} meses</span>
                                )}
                                {useFixedInstallment && installmentAmount && (
                                    <span><strong>Cuota deseada:</strong> ${installmentAmount}</span>
                                )}
                            </div>
                            <div className="max-h-60 overflow-y-auto bg-white rounded-md border border-gray-200">
                                <table className="w-full text-left text-sm">
                                    <thead className="bg-gray-50 text-gray-600">
                                        <tr>
                                            <th className="py-2 px-3 w-10">#</th>
                                            <th className="py-2 px-3 w-32">Día</th>
                                            <th className="py-2 px-3 w-32">Fecha</th>
                                            <th className="py-2 px-3">Monto</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y">
                                        {paymentPlanView.map((p, idx) => {
                                            const dueDate = p.dueDate ? new Date(p.dueDate) : null;
                                            const due = dueDate ? dueDate.toLocaleDateString() : '-';
                                            const day = dueDate
                                                ? new Intl.DateTimeFormat('es-CO', { weekday: 'long' }).format(dueDate)
                                                : '-';
                                            const amount = p.scheduledAmount ? formatMoney(p.scheduledAmount) : '-';
                                            return (
                                                <tr key={p.installmentNumber || idx} className="text-gray-800">
                                                    <td className="py-2 px-3">{p.installmentNumber ?? idx + 1}</td>
                                                    <td className="py-2 px-3 capitalize">{day}</td>
                                                    <td className="py-2 px-3">{due}</td>
                                                    <td className="py-2 px-3">{amount === '-' ? '-' : `$${amount}`}</td>
                                                </tr>
                                            );
                                        })}
                                        {paymentPlanView.length === 0 && (
                                            <tr>
                                                <td className="py-3 text-center text-gray-500" colSpan={4}>
                                                    Sin cuotas generadas
                                                </td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}
                </form>
            </div>
        </div>
    );
};

export default CreditForm;
