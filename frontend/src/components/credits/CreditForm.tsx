import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '../../store/authStore';
import { invalidateMoney } from '../../utils/invalidate';
import { getBusinesses } from '../../api/business.api';
import { searchClients, getClients } from '../../api/clients.api';
import { createCredit, simulateCredit, CreditSimulation, CreateCreditPayload } from '../../api/credits.api';
import { listAccounts, getAccountBalances, PaymentAccount } from '../../api/accounts.api';
import { injectCapital, transferFunds } from '../../api/cash.api';
import { Client, PaymentFrequency } from '../../types';
import { Search, Calculator, Save, X, Download, Wallet, Building2, Smartphone, AlertTriangle, ArrowRightLeft, PlusCircle } from 'lucide-react';
import jsPDF from 'jspdf';
import { todayBogota, toLocalDateString } from '../../utils/dates';
import { getHolidaySet } from '../../utils/holidays';

interface CreditFormProps {
    onClose: () => void;
    onCreated: (id: string) => void;
    selectedBusinessId?: string;
}

const frequencies: { value: PaymentFrequency; label: string }[] = [
    { value: 'daily', label: 'Diario' },
    { value: 'weekly', label: 'Semanal' },
    { value: 'bisemanal', label: 'Bisemanal (Cada 14 días)' },
    { value: 'quincenal', label: 'Quincenal (Días 15 y 30)' },
    { value: 'monthly', label: 'Mensual' },
];

const frequencyLabels: Record<PaymentFrequency, string> = {
    daily: 'Diario',
    weekly: 'Semanal',
    bisemanal: 'Bisemanal',
    quincenal: 'Quincenal',
    monthly: 'Mensual',
};

const formatMoney = (value: any) => Math.ceil(Number(value || 0)).toLocaleString('es-CO');
const DAYS_PER_MONTH = 30; // 1 mes = 30 días (alineado con backend y detalles)

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
        termUnit: 'months' as 'days' | 'weeks' | 'quincenal' | 'months',
        frequency: 'monthly' as PaymentFrequency,
        startDate: todayBogota(),
        businessId: selectedBusinessId || '',
    });

    // Convierte el plazo ingresado (en la unidad elegida) a días
    const TERM_UNIT_DAYS: Record<'days' | 'weeks' | 'quincenal' | 'months', number> = {
        days: 1, weeks: 7, quincenal: 15, months: DAYS_PER_MONTH,
    };
    const termValueToDays = (value: number, unit: keyof typeof TERM_UNIT_DAYS) =>
        value * TERM_UNIT_DAYS[unit];
    const [useFixedInstallment, setUseFixedInstallment] = useState(false);
    const [installmentAmount, setInstallmentAmount] = useState('');
    const [fixedTermUnit, setFixedTermUnit] = useState<'days' | 'weeks' | 'quincenal' | 'months'>('months');
    const [excludedWeekdays, setExcludedWeekdays] = useState<number[]>([]);
    const [excludeHolidays, setExcludeHolidays] = useState(false);
    const [customRounding, setCustomRounding] = useState(false);
    const [showFechasPanel, setShowFechasPanel] = useState(false);

    const isSuperAdmin = user?.role === 'super_admin';
    const isAdmin = user?.role === 'admin' || user?.role === 'super_admin';

    // Cuenta de desembolso
    const [disbursementAccountId, setDisbursementAccountId] = useState<string>('');
    // Multi-cuenta
    const [splitEnabled, setSplitEnabled] = useState(false);
    const [splits, setSplits] = useState<Record<string, string>>({});
    // Modal de recarga cuando la cuenta o el negocio no tiene fondos
    const [rechargeInfo, setRechargeInfo] = useState<{
        accountId: string; accountName: string; available: number; required: number;
        scope?: 'business' | 'account';
    } | null>(null);
    // Guardamos el último payload intentado para reintentar tras recargar
    const pendingPayloadRef = useRef<CreateCreditPayload | null>(null);

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

    // ID efectivo del negocio (super_admin elige, otros tienen el asignado)
    const effectiveBusinessId = isSuperAdmin
        ? formData.businessId
        : (user?.assignedBusiness?.id || '');

    const { data: accounts } = useQuery({
        queryKey: ['accounts', effectiveBusinessId],
        queryFn: () => listAccounts(effectiveBusinessId),
        enabled: !!effectiveBusinessId,
    });

    const { data: accountBalances } = useQuery({
        queryKey: ['account-balances', effectiveBusinessId],
        queryFn: () => getAccountBalances(effectiveBusinessId),
        enabled: !!effectiveBusinessId,
    });

    // Setear la cuenta predeterminada de desembolso cuando carguen las cuentas
    useEffect(() => {
        if (accounts && accounts.length > 0) {
            const def = accounts.find(a => a.isDisbursementDefault)
                || accounts.find(a => a.isDefault)
                || accounts[0];
            if (def && !disbursementAccountId) setDisbursementAccountId(def.id);
        }
    }, [accounts]);

    // Resetear cuenta al cambiar de negocio (super_admin)
    useEffect(() => {
        setDisbursementAccountId('');
        setSplitEnabled(false);
        setSplits({});
    }, [effectiveBusinessId]);

    const { data: clientResults } = useQuery({
        queryKey: ['clients', 'search', clientSearch, formData.businessId],
        queryFn: () => searchClients(clientSearch, formData.businessId),
        enabled: clientSearch.length > 0,
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
        const rateDecimal = interestRate / 100;

        // Calcular pagos por mes para estimar interés por cuota
        let paymentsPerMonth = 1;
        if (frequency === 'weekly') paymentsPerMonth = 4;
        else if (frequency === 'bisemanal' || frequency === 'quincenal') paymentsPerMonth = 2;
        else if (frequency === 'daily') paymentsPerMonth = 30;

        const interestPerPayment = rateDecimal / paymentsPerMonth;

        const denominator = installment - (amount * interestPerPayment);
        // Si la cuota no supera el interés del período, el crédito nunca se paga → retornar 0 como señal de error
        if (denominator < 1) return 0;

        const payments = Math.max(1, Math.ceil(amount / denominator));
        return Math.ceil((payments / paymentsPerMonth) * 30);
    };

    const createMutation = useMutation({
        mutationFn: createCredit,
        onSuccess: (credit) => {
            invalidateMoney(queryClient);
            setRechargeInfo(null);
            pendingPayloadRef.current = null;
            onCreated(credit.id);
        },
        onError: (err: any) => {
            const data = err.response?.data;
            if (data?.code === 'INSUFFICIENT_ACCOUNT_BALANCE' ||
                data?.code === 'INSUFFICIENT_BUSINESS_BALANCE') {
                if (isAdmin) {
                    setRechargeInfo(data.details);
                } else {
                    setFormError(data.error || 'Saldo insuficiente. Pide a un administrador que recargue la caja.');
                }
                return;
            }
            const errors = data?.errors;
            if (Array.isArray(errors) && errors.length > 0) {
                setFormError(errors[0].msg);
                return;
            }
            setFormError(data?.error || 'Error al crear el crédito');
        },
    });

    // Re-simular automáticamente cuando cambian las opciones de fechas/personalizar
    useEffect(() => {
        if (!simulation) return;
        handleSimulate();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [excludedWeekdays, excludeHolidays, customRounding]);

    const handleSimulate = () => {
        setFormError('');
        if (!selectedClientId) return setFormError('Selecciona un cliente');
        const amount = Number(formData.amount.replace(/[^0-9]/g, ''));
        const interestRate = Number(formData.interestRate);
        const installment = Number(installmentAmount.replace(/[^0-9]/g, ''));
        let termDays = termValueToDays(Number(formData.termMonths), formData.termUnit);

        if (useFixedInstallment) {
            if (Number.isNaN(installment) || installment <= 0) return setFormError('Ingresa una cuota válida');
            termDays = estimateTermDays(amount, interestRate, installment, formData.frequency);
            if (termDays <= 0) return setFormError('La cuota no cubre los intereses del período. Auméntala.');
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
            excludedWeekdays: excludedWeekdays.length > 0 ? excludedWeekdays : undefined,
            excludeHolidays: excludeHolidays || undefined,
            customRounding: customRounding || undefined,
        });
    };

    const handleSubmit = (e?: React.FormEvent) => {
        e?.preventDefault();
        if (createMutation.isPending) return;   // evitar doble envío por clic rápido
        setFormError('');
        if (!selectedClientId) return setFormError('Selecciona un cliente');
        const amount = Number(formData.amount.replace(/[^0-9]/g, ''));
        const interestRate = Number(formData.interestRate);
        const installment = Number(installmentAmount.replace(/[^0-9]/g, ''));
        let termDays = termValueToDays(Number(formData.termMonths), formData.termUnit);

        if (useFixedInstallment) {
            if (Number.isNaN(installment) || installment <= 0) return setFormError('Ingresa una cuota válida');
            termDays = estimateTermDays(amount, interestRate, installment, formData.frequency);
            if (termDays <= 0) return setFormError('La cuota no cubre los intereses del período. Auméntala.');
        }

        if (Number.isNaN(amount) || amount <= 0 || Number.isNaN(interestRate) || interestRate <= 0 || Number.isNaN(termDays) || termDays <= 0) {
            return setFormError('Monto, interés y plazo deben ser mayores a 0');
        }
        if (isSuperAdmin && !formData.businessId) {
            return setFormError('Selecciona un negocio');
        }

        // Validar reparto multi-cuenta
        if (splitEnabled && accounts && accounts.length > 0) {
            const splitEntries = accounts
                .map(a => ({ accountId: a.id, amount: Number((splits[a.id] || '').replace(/[^0-9]/g, '') || '0') }))
                .filter(s => s.amount > 0);
            const splitTotal = splitEntries.reduce((s, e) => s + e.amount, 0);
            if (Math.abs(splitTotal - amount) > 1) {
                return setFormError(`El reparto debe sumar exactamente $${amount.toLocaleString('es-CO')} (suma actual: $${Math.ceil(splitTotal).toLocaleString('es-CO')})`);
            }
            // Adjuntar al payload
            const payload: CreateCreditPayload = {
                clientId: selectedClientId, amount, interestRate, termDays,
                frequency: formData.frequency, startDate: formData.startDate,
                businessId: formData.businessId || undefined,
                splits: splitEntries,
                excludedWeekdays: excludedWeekdays.length > 0 ? excludedWeekdays : undefined,
                excludeHolidays: excludeHolidays || undefined,
                customRounding: customRounding || undefined,
            };
            pendingPayloadRef.current = payload;
            createMutation.mutate(payload);
            return;
        }

        const payload: CreateCreditPayload = {
            clientId: selectedClientId,
            amount,
            interestRate,
            termDays,
            frequency: formData.frequency,
            startDate: formData.startDate,
            businessId: formData.businessId || undefined,
            accountId: disbursementAccountId || undefined,
            excludedWeekdays: excludedWeekdays.length > 0 ? excludedWeekdays : undefined,
            excludeHolidays: excludeHolidays || undefined,
            customRounding: customRounding || undefined,
        };
        pendingPayloadRef.current = payload;
        createMutation.mutate(payload);
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
        const termUnitLabels = { days: 'días', weeks: 'semanas', quincenal: 'quincenas', months: 'meses' };
        doc.text(`Monto: $${formData.amount}  Interés: ${formData.interestRate}%  Plazo: ${formData.termMonths} ${termUnitLabels[formData.termUnit]}`, 14, startY + 20);
        doc.text(`Frecuencia: ${frequencyLabels[formData.frequency] || formData.frequency}  Fecha inicio: ${formData.startDate}`, 14, startY + 26);
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
            // Calcular interés mínimo por período para validar
            let paymentsPerMonth = 1;
            if (formData.frequency === 'weekly') paymentsPerMonth = 4;
            else if (formData.frequency === 'bisemanal' || formData.frequency === 'quincenal') paymentsPerMonth = 2;
            else if (formData.frequency === 'daily') paymentsPerMonth = 30;
            const interestCostPerPeriod = amount * (interestRate / 100) / paymentsPerMonth;
            const minInstallment = Math.ceil(interestCostPerPeriod) + 1;

            if (installment <= interestCostPerPeriod) {
                return {
                    error: `La cuota no cubre los intereses del período ($${Math.ceil(interestCostPerPeriod).toLocaleString('es-CO')}). Mínimo requerido: $${minInstallment.toLocaleString('es-CO')}`,
                };
            }

            const termDays = estimateTermDays(amount, interestRate, installment, formData.frequency);
            const divisorMap: Record<typeof fixedTermUnit, number> = { days: 1, weeks: 7, quincenal: 15, months: 30 };
            const labelMap: Record<typeof fixedTermUnit, string> = { days: 'días', weeks: 'semanas', quincenal: 'quincenas', months: 'meses' };
            return {
                termDays,
                termInUnit: Math.ceil(termDays / divisorMap[fixedTermUnit]),
                unitLabel: labelMap[fixedTermUnit],
            };
        }
        return null;
    }, [formData.amount, formData.frequency, formData.interestRate, installmentAmount, useFixedInstallment, fixedTermUnit]);

    const paymentPlanView = useMemo(() => {
        if (!simulation || !Array.isArray(simulation.paymentPlan)) return [];

        return simulation.paymentPlan.map((p, idx) => ({
            installmentNumber: p.installmentNumber ?? idx + 1,
            dueDate: p.dueDate, // Mantener como string/Date retornado por el API
            scheduledAmount: Number(p.scheduledAmount),
        }));
    }, [simulation]);

    /** Set de festivos colombianos para el rango del plan actual — evita recalcular por fila */
    const planHolidaySet = useMemo(() => {
        if (paymentPlanView.length === 0) return new Set<string>();
        const years = new Set<number>();
        for (const p of paymentPlanView) {
            if (p.dueDate) years.add(new Date(p.dueDate).getFullYear());
        }
        return getHolidaySet(Array.from(years));
    }, [paymentPlanView]);

    const addToAmount = (delta: number) => {
        setFormError('');
        const current = Number(formData.amount.replace(/[^0-9]/g, '') || '0');
        const next = current + delta;
        setFormData(prev => ({ ...prev, amount: next.toLocaleString('es-CO') }));
    };
    const clearAmount = () => {
        setFormError('');
        setFormData(prev => ({ ...prev, amount: '' }));
    };
    const addToSplit = (accountId: string, delta: number) => {
        setFormError('');
        const current = Number((splits[accountId] || '').replace(/[^0-9]/g, '') || '0');
        setSplits(prev => ({ ...prev, [accountId]: (current + delta).toLocaleString('es-CO') }));
    };
    const clearSplit = (accountId: string) => {
        setFormError('');
        setSplits(prev => ({ ...prev, [accountId]: '' }));
    };

    return <>
        {rechargeInfo && accounts && (
            <RechargeAccountModal
                businessId={effectiveBusinessId}
                info={rechargeInfo}
                allAccounts={accounts}
                onClose={() => { setRechargeInfo(null); pendingPayloadRef.current = null; }}
                onSuccess={() => {
                    invalidateMoney(queryClient);
                    setRechargeInfo(null);
                    // Reintentar el crédito automáticamente
                    if (pendingPayloadRef.current) {
                        createMutation.mutate(pendingPayloadRef.current);
                    }
                }}
            />
        )}
        {createPortal(
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
                                {clientSearch.length > 0 && clientResults && clientResults.length > 0 && (
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
                            <div className="md:col-span-2">
                                <label className="block text-sm font-semibold text-gray-700 mb-1">Monto *</label>
                                <input
                                    type="text"
                                    value={formData.amount}
                                    onChange={(e) => {
                                        const raw = e.target.value.replace(/[^0-9]/g, '');
                                        setFormData({ ...formData, amount: raw ? Number(raw).toLocaleString('es-CO') : '' });
                                    }}
                                    className="w-full px-3 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 text-gray-900 text-lg font-semibold"
                                    placeholder="0"
                                />
                                <div className="flex flex-wrap gap-1.5 mt-2">
                                    {[
                                        { label: '+1k', delta: 1_000 },
                                        { label: '+10k', delta: 10_000 },
                                        { label: '+50k', delta: 50_000 },
                                        { label: '+100k', delta: 100_000 },
                                        { label: '+500k', delta: 500_000 },
                                        { label: '+1M', delta: 1_000_000 },
                                    ].map(({ label, delta }) => (
                                        <button
                                            key={label}
                                            type="button"
                                            onClick={() => addToAmount(delta)}
                                            className="px-2.5 py-1 text-xs font-semibold rounded-lg border border-primary-200 bg-primary-50 text-primary-700 hover:bg-primary-100 active:bg-primary-200 transition"
                                        >
                                            {label}
                                        </button>
                                    ))}
                                    <button
                                        type="button"
                                        onClick={clearAmount}
                                        className="px-2.5 py-1 text-xs font-semibold rounded-lg border border-red-200 bg-red-50 text-red-600 hover:bg-red-100 active:bg-red-200 transition"
                                    >
                                        Borrar
                                    </button>
                                </div>
                            </div>

                            {/* Cuenta de desembolso */}
                            {accounts && accounts.length > 0 && (
                                <div className="md:col-span-2 space-y-3">
                                    <div className="flex items-center justify-between">
                                        <label className="block text-sm font-semibold text-gray-700">
                                            ¿De qué cuenta sale el dinero?
                                        </label>
                                        <label className="flex items-center gap-2 cursor-pointer select-none">
                                            <input
                                                type="checkbox"
                                                checked={splitEnabled}
                                                onChange={(e) => {
                                                    setSplitEnabled(e.target.checked);
                                                    setSplits({});
                                                }}
                                                className="w-4 h-4 rounded border-gray-300 text-primary-600 cursor-pointer"
                                            />
                                            <span className="text-xs text-gray-600 font-medium">Repartir entre varias cuentas</span>
                                        </label>
                                    </div>

                                    {!splitEnabled ? (
                                        /* Modo una cuenta: chips existentes */
                                        <div className="flex flex-wrap gap-2">
                                            {accounts.map(a => {
                                                const Icon = a.type === 'cash' ? Wallet : a.type === 'wallet' ? Smartphone : Building2;
                                                const active = disbursementAccountId === a.id;
                                                const bal = accountBalances?.accounts.find(b => b.id === a.id);
                                                return (
                                                    <button
                                                        key={a.id}
                                                        type="button"
                                                        onClick={() => setDisbursementAccountId(a.id)}
                                                        className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-sm font-medium transition ${active ? 'bg-primary-600 text-white border-primary-600' : 'bg-white text-gray-700 border-gray-300 hover:border-primary-400'}`}
                                                    >
                                                        <Icon size={15} />
                                                        <span>{a.name}</span>
                                                        {bal !== undefined && (
                                                            <span className={`text-[11px] ml-1 ${active ? 'text-primary-100' : 'text-gray-400'}`}>
                                                                ${Math.ceil(bal.balance).toLocaleString('es-CO')}
                                                            </span>
                                                        )}
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    ) : (
                                        /* Modo multi-cuenta: input por cuenta */
                                        <div className="space-y-2">
                                            {accounts.map(a => {
                                                const Icon = a.type === 'cash' ? Wallet : a.type === 'wallet' ? Smartphone : Building2;
                                                const bal = accountBalances?.accounts.find(b => b.id === a.id);
                                                return (
                                                    <div key={a.id} className="flex items-center gap-3 bg-gray-50 rounded-xl px-3 py-2.5 border border-gray-200">
                                                        <Icon size={16} className="text-gray-400 shrink-0" />
                                                        <div className="flex-1 min-w-0">
                                                            <div className="flex items-center justify-between mb-1">
                                                                <span className="text-sm font-medium text-gray-800">{a.name}</span>
                                                                {bal !== undefined && (
                                                                    <span className="text-xs text-gray-400">Disponible: ${Math.ceil(bal.balance).toLocaleString('es-CO')}</span>
                                                                )}
                                                            </div>
                                                            <input
                                                                type="text"
                                                                value={splits[a.id] || ''}
                                                                onChange={(e) => {
                                                                    const raw = e.target.value.replace(/[^0-9]/g, '');
                                                                    setSplits(prev => ({ ...prev, [a.id]: raw ? Number(raw).toLocaleString('es-CO') : '' }));
                                                                }}
                                                                className="w-full px-2.5 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 text-gray-900"
                                                                placeholder="0"
                                                            />
                                                            <div className="flex flex-wrap gap-1 mt-1.5">
                                                                {[
                                                                    { label: '+1k',   delta: 1_000 },
                                                                    { label: '+10k',  delta: 10_000 },
                                                                    { label: '+50k',  delta: 50_000 },
                                                                    { label: '+100k', delta: 100_000 },
                                                                    { label: '+500k', delta: 500_000 },
                                                                    { label: '+1M',   delta: 1_000_000 },
                                                                ].map(({ label, delta }) => (
                                                                    <button key={label} type="button" onClick={() => addToSplit(a.id, delta)}
                                                                        className="px-2 py-0.5 text-[10px] font-semibold rounded-md border border-primary-200 bg-primary-50 text-primary-700 hover:bg-primary-100 active:bg-primary-200 transition">
                                                                        {label}
                                                                    </button>
                                                                ))}
                                                                <button type="button" onClick={() => clearSplit(a.id)}
                                                                    className="px-2 py-0.5 text-[10px] font-semibold rounded-md border border-red-200 bg-red-50 text-red-600 hover:bg-red-100 active:bg-red-200 transition">
                                                                    Borrar
                                                                </button>
                                                            </div>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                            {/* Indicador de cuadre */}
                                            {(() => {
                                                const total = Number(formData.amount.replace(/[^0-9]/g, '') || '0');
                                                const sumado = accounts.reduce((s, a) => s + Number((splits[a.id] || '').replace(/[^0-9]/g, '') || '0'), 0);
                                                const restante = total - sumado;
                                                const ok = Math.abs(restante) <= 1;
                                                return total > 0 ? (
                                                    <div className={`flex items-center justify-between text-xs px-3 py-2 rounded-lg ${ok ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-amber-50 text-amber-700 border border-amber-200'}`}>
                                                        <span>Sumado: <strong>${Math.ceil(sumado).toLocaleString('es-CO')}</strong></span>
                                                        <span>{ok ? '✓ Cuadra' : `Faltan: $${Math.ceil(restante).toLocaleString('es-CO')}`}</span>
                                                    </div>
                                                ) : null;
                                            })()}
                                        </div>
                                    )}
                                </div>
                            )}

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
                                <div className="flex flex-wrap gap-1.5 mt-1.5">
                                    {[5, 6, 7, 10].map((v) => (
                                        <button
                                            key={v}
                                            type="button"
                                            onClick={() => { setFormError(''); setFormData({ ...formData, interestRate: String(v) }); }}
                                            className={`px-3 py-1 text-xs font-semibold rounded-lg border transition ${
                                                Number(formData.interestRate) === v
                                                    ? 'bg-primary-600 text-white border-primary-600'
                                                    : 'border-primary-200 bg-primary-50 text-primary-700 hover:bg-primary-100'
                                            }`}
                                        >
                                            {v}%
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Frecuencia — col 2 junto a Interés, sin celdas vacías */}
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

                                {useFixedInstallment && (
                                    <div className="space-y-3">
                                        <div>
                                            <label className="block text-sm font-semibold text-primary-700 mb-1">Cuota deseada</label>
                                            <input
                                                type="text"
                                                value={installmentAmount}
                                                onChange={(e) => {
                                                    const raw = e.target.value.replace(/[^0-9]/g, '');
                                                    setInstallmentAmount(raw ? Number(raw).toLocaleString('es-CO') : '');
                                                }}
                                                className="w-full px-3 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 text-gray-900"
                                                placeholder="Ej: 100.000"
                                            />
                                            <p className="text-xs text-primary-600 mt-1">Recalcularemos el plazo estimado según esta cuota.</p>
                                        </div>

                                        {/* Selector de unidad del plazo estimado */}
                                        <div>
                                            <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wide">
                                                Mostrar plazo estimado en
                                            </label>
                                            <div className="flex rounded-xl border border-gray-300 overflow-hidden text-xs w-fit">
                                                {(['days', 'weeks', 'quincenal', 'months'] as const).map((u, i) => {
                                                    const labels: Record<typeof u, string> = { days: 'Días', weeks: 'Semanas', quincenal: 'Quincenas', months: 'Meses' };
                                                    return (
                                                        <button
                                                            key={u}
                                                            type="button"
                                                            onClick={() => setFixedTermUnit(u)}
                                                            className={`px-3 py-2 font-medium transition ${i > 0 ? 'border-l border-gray-300' : ''} ${fixedTermUnit === u ? 'bg-primary-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
                                                        >
                                                            {labels[u]}
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                        </div>

                                        {derivedTermInfo && (
                                            'error' in derivedTermInfo ? (
                                                <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg p-3 flex items-start gap-2">
                                                    <span className="mt-0.5 shrink-0">⚠️</span>
                                                    <span>{derivedTermInfo.error}</span>
                                                </div>
                                            ) : (
                                                <div className="text-sm text-primary-900 bg-primary-50 rounded-lg p-3">
                                                    <strong>Plazo estimado:</strong> {derivedTermInfo.termInUnit} {derivedTermInfo.unitLabel} ({derivedTermInfo.termDays} días)
                                                </div>
                                            )
                                        )}
                                    </div>
                                )}
                            </div>

                            {/* Plazo con unidad (días / semanas / quincenas / meses) */}
                            <div className="md:col-span-2">
                                {(() => {
                                    const unitLabels: Record<'days' | 'weeks' | 'quincenal' | 'months', string> = { days: 'días', weeks: 'semanas', quincenal: 'quincenas', months: 'meses' };
                                    const unitPlaceholders: Record<'days' | 'weeks' | 'quincenal' | 'months', string> = { days: '30', weeks: '6', quincenal: '4', months: '2' };
                                    const unitSteps: Record<'days' | 'weeks' | 'quincenal' | 'months', string> = { days: '1', weeks: '1', quincenal: '1', months: '0.5' };
                                    return (
                                        <>
                                            <label className="block text-sm font-semibold text-gray-700 mb-1">
                                                Plazo ({unitLabels[formData.termUnit]}) *
                                            </label>
                                            <input
                                                type="number"
                                                value={formData.termMonths}
                                                onChange={(e) => setFormData({ ...formData, termMonths: e.target.value })}
                                                className="w-full px-3 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 text-gray-900"
                                                min="1"
                                                step={unitSteps[formData.termUnit]}
                                                placeholder={unitPlaceholders[formData.termUnit]}
                                            />
                                            {/* Selector de unidad — fila propia para que los 4 botones siempre quepan */}
                                            <div className="flex rounded-xl border border-gray-300 overflow-hidden text-xs mt-1.5">
                                                {(['days', 'weeks', 'quincenal', 'months'] as const).map((u, i) => {
                                                    const btnLabels = { days: 'Días', weeks: 'Semanas', quincenal: 'Quincenas', months: 'Meses' };
                                                    return (
                                                        <button
                                                            key={u}
                                                            type="button"
                                                            onClick={() => setFormData({ ...formData, termUnit: u })}
                                                            className={`flex-1 py-2 font-medium transition ${i > 0 ? 'border-l border-gray-300' : ''} ${formData.termUnit === u ? 'bg-primary-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
                                                        >
                                                            {btnLabels[u]}
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                            <p className="text-xs text-gray-500 mt-1">
                                                Ej: {unitPlaceholders[formData.termUnit]} {unitLabels[formData.termUnit]}.
                                                {formData.termUnit === 'months' && ' Si usas cuota fija, el plazo se recalcula automáticamente.'}
                                            </p>
                                        </>
                                    );
                                })()}
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

                                {/* Botones de acción */}
                                <div className="flex flex-wrap gap-2">
                                    <button
                                        type="button"
                                        onClick={handleDownloadPDF}
                                        className="inline-flex items-center gap-2 px-3 py-2 border border-primary-600 text-primary-700 bg-white rounded-lg text-sm font-medium hover:bg-primary-50 transition"
                                    >
                                        <Download size={16} /> Descargar PDF
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setShowFechasPanel(v => !v)}
                                        className={`inline-flex items-center gap-2 px-3 py-2 border rounded-lg text-sm font-medium transition ${showFechasPanel ? 'bg-primary-600 text-white border-primary-600' : 'border-gray-300 text-gray-700 bg-white hover:bg-gray-50'}`}
                                    >
                                        📅 Fechas
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setCustomRounding(v => !v)}
                                        className={`inline-flex items-center gap-2 px-3 py-2 border rounded-lg text-sm font-medium transition ${customRounding ? 'bg-primary-600 text-white border-primary-600' : 'border-gray-300 text-gray-700 bg-white hover:bg-gray-50'}`}
                                    >
                                        ✨ Personalizar
                                    </button>
                                </div>

                                {/* Panel de Fechas */}
                                {showFechasPanel && (
                                    <div className="bg-white border border-gray-200 rounded-xl p-3 space-y-3">
                                        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Excluir días de cobro</p>
                                        <div className="flex flex-wrap gap-2">
                                            {[
                                                { day: 1, label: 'Lun' },
                                                { day: 2, label: 'Mar' },
                                                { day: 3, label: 'Mié' },
                                                { day: 4, label: 'Jue' },
                                                { day: 5, label: 'Vie' },
                                                { day: 6, label: 'Sáb' },
                                                { day: 0, label: 'Dom' },
                                            ].map(({ day, label }) => {
                                                const isSelected = excludedWeekdays.includes(day);
                                                const wouldExcludeAll = !isSelected && excludedWeekdays.length >= 6;
                                                return (
                                                    <button
                                                        key={day}
                                                        type="button"
                                                        disabled={wouldExcludeAll}
                                                        onClick={() => setExcludedWeekdays(prev =>
                                                            prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day]
                                                        )}
                                                        className={`px-3 py-1.5 text-xs font-semibold rounded-lg border transition ${
                                                            isSelected
                                                                ? 'bg-red-500 text-white border-red-500'
                                                                : wouldExcludeAll
                                                                ? 'bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed'
                                                                : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                                                        }`}
                                                    >
                                                        {label}
                                                    </button>
                                                );
                                            })}
                                        </div>
                                        <label className="flex items-center gap-2 cursor-pointer text-sm text-gray-700">
                                            <input
                                                type="checkbox"
                                                checked={excludeHolidays}
                                                onChange={e => setExcludeHolidays(e.target.checked)}
                                                className="w-4 h-4 rounded border-gray-300 text-primary-600"
                                            />
                                            Excluir festivos colombianos
                                        </label>
                                        {(excludedWeekdays.length > 0 || excludeHolidays) && (
                                            <p className="text-xs text-blue-600">
                                                Los días excluidos no tendrán cuota: el total se reparte en menos cuotas dentro del mismo plazo, por lo que cada cuota sube.
                                            </p>
                                        )}
                                    </div>
                                )}

                                {/* Info de personalizar */}
                                {customRounding && (
                                    <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-xs text-amber-800">
                                        <strong>Personalizar activo:</strong> cuotas &lt; $10.000 → múltiplo de $1.000; ≥ $10.000 → múltiplo de $10.000. El número de cuotas puede ser menor al del plazo (la última absorbe el remanente).
                                    </div>
                                )}

                                {/* Tabla de pagos */}
                                <div className="max-h-48 overflow-y-auto bg-white rounded-lg border border-gray-200">
                                    <table className="w-full text-left text-sm">
                                        <thead className="bg-gray-50 text-gray-600 sticky top-0">
                                            <tr>
                                                <th className="py-2 px-3">#</th>
                                                <th className="py-2 px-3">Fecha</th>
                                                <th className="py-2 px-3">Monto</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y">
                                            {paymentPlanView.map((p, idx) => {
                                                const dueDate = p.dueDate ? new Date(p.dueDate) : null;
                                                const due = dueDate ? toLocalDateString(dueDate) : '-';
                                                const day = dueDate ? new Intl.DateTimeFormat('es-CO', { weekday: 'short' }).format(dueDate) : '';
                                                const amount = p.scheduledAmount ? formatMoney(p.scheduledAmount) : '-';
                                                const isSunday = dueDate ? dueDate.getDay() === 0 : false;
                                                const isFestivo = dueDate ? planHolidaySet.has(toLocalDateString(dueDate)) : false;
                                                const isRed = isSunday || isFestivo;
                                                return (
                                                    <tr key={p.installmentNumber || idx} className={isRed ? 'bg-red-50 text-red-700' : 'text-gray-800'}>
                                                        <td className="py-2 px-3">{p.installmentNumber ?? idx + 1}</td>
                                                        <td className="py-2 px-3">
                                                            {day && <span className="capitalize font-medium mr-1">{day}</span>}
                                                            {due}
                                                        </td>
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
        , document.body)}
    </>;
};

// ─── Modal de recarga de cuenta ───────────────────────────────────────────────

interface RechargeModalProps {
    businessId: string;
    info: { accountId: string; accountName: string; available: number; required: number; scope?: 'business' | 'account' };
    allAccounts: PaymentAccount[];
    onClose: () => void;
    onSuccess: () => void;
}

const RechargeAccountModal: React.FC<RechargeModalProps> = ({ businessId, info, allAccounts, onClose, onSuccess }) => {
    // scope='business' → el saldo TOTAL del negocio es insuficiente; solo inyectar tiene sentido
    const injectOnly = info.scope === 'business';
    const [mode, setMode] = useState<'inject' | 'transfer'>('inject');
    const [fromAccountId, setFromAccountId] = useState(() => {
        const other = allAccounts.find(a => a.id !== info.accountId);
        return other?.id || '';
    });
    const [amount, setAmount] = useState(String(info.required - info.available > 0 ? info.required - info.available : info.required));
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    const otherAccounts = allAccounts.filter(a => a.id !== info.accountId);

    const handleConfirm = async () => {
        setError('');
        const amt = Number(amount.replace(/[^0-9]/g, ''));
        if (amt <= 0) { setError('Ingresa un monto válido'); return; }

        setLoading(true);
        try {
            if (mode === 'inject') {
                await injectCapital({ businessId, amount: amt, accountId: info.accountId, description: `Recarga para desembolso de crédito` });
            } else {
                if (!fromAccountId) { setError('Selecciona una cuenta origen'); setLoading(false); return; }
                await transferFunds({ businessId, amount: amt, fromAccountId, toAccountId: info.accountId, description: `Transferencia para desembolso de crédito` });
            }
            onSuccess();
        } catch (e: any) {
            setError(e.response?.data?.error || 'Error al recargar');
        } finally {
            setLoading(false);
        }
    };

    const fmtCOP = (v: number) => `$${Math.ceil(v).toLocaleString('es-CO')}`;
    const falta = Math.max(0, info.required - info.available);

    return createPortal(
        <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/60 p-4">
            <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 space-y-4">
                <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2 text-amber-700">
                        <AlertTriangle size={20} />
                        <h3 className="text-base font-bold">Saldo insuficiente</h3>
                    </div>
                    <button onClick={onClose}><X size={18} className="text-gray-400" /></button>
                </div>

                <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-sm text-amber-800">
                    {injectOnly
                        ? <>El saldo total de la caja es {fmtCOP(info.available)} y el crédito requiere {fmtCOP(info.required)}.
                           {falta > 0 && <> Faltan <strong>{fmtCOP(falta)}</strong>.</>}{' '}
                           El dinero se ingresará a la cuenta <strong>{info.accountName}</strong>.</>
                        : <>La cuenta <strong>{info.accountName}</strong> tiene {fmtCOP(info.available)} y el crédito requiere {fmtCOP(info.required)}.
                           {falta > 0 && <> Faltan <strong>{fmtCOP(falta)}</strong>.</> }</>
                    }
                </div>

                {/* Modo — solo mostrar el selector si hay más de una opción */}
                {!injectOnly && (
                    <div className="flex gap-2">
                        <button
                            type="button"
                            onClick={() => setMode('inject')}
                            className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-xl border text-sm font-medium transition ${mode === 'inject' ? 'bg-primary-600 text-white border-primary-600' : 'bg-white text-gray-700 border-gray-300'}`}
                        >
                            <PlusCircle size={15} /> Recargar cuenta
                        </button>
                        {otherAccounts.length > 0 && (
                            <button
                                type="button"
                                onClick={() => setMode('transfer')}
                                className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-xl border text-sm font-medium transition ${mode === 'transfer' ? 'bg-primary-600 text-white border-primary-600' : 'bg-white text-gray-700 border-gray-300'}`}
                            >
                                <ArrowRightLeft size={15} /> Transferir
                            </button>
                        )}
                    </div>
                )}

                {mode === 'transfer' && (
                    <div>
                        <label className="block text-sm font-semibold text-gray-700 mb-1">Cuenta origen</label>
                        <select value={fromAccountId} onChange={e => setFromAccountId(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-xl text-sm">
                            {otherAccounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                        </select>
                    </div>
                )}

                <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-1">Monto a {mode === 'inject' ? 'ingresar' : 'transferir'}</label>
                    <input
                        type="text"
                        value={Number(amount.replace(/[^0-9]/g, '')).toLocaleString('es-CO')}
                        onChange={e => setAmount(e.target.value.replace(/[^0-9]/g, ''))}
                        className="w-full px-3 py-2 border border-gray-300 rounded-xl text-sm"
                    />
                    <p className="text-xs text-gray-500 mt-1">Mínimo sugerido: {fmtCOP(falta > 0 ? falta : info.required)}</p>
                </div>

                {error && <p className="text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-lg p-2">{error}</p>}

                <div className="flex gap-2 pt-1">
                    <button onClick={onClose} className="flex-1 py-2 bg-gray-100 text-gray-700 rounded-xl text-sm font-medium">Cancelar</button>
                    <button
                        onClick={handleConfirm}
                        disabled={loading}
                        className="flex-1 py-2 bg-primary-600 text-white rounded-xl text-sm font-medium hover:bg-primary-700 disabled:opacity-50"
                    >
                        {loading ? 'Procesando...' : 'Confirmar y crear crédito'}
                    </button>
                </div>
            </div>
        </div>,
        document.body
    );
};

export default CreditForm;
