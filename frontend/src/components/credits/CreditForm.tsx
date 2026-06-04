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
import { todayBogota } from '../../utils/dates';

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
const gapDaysMap: Record<PaymentFrequency, number> = {
    daily: 1,
    weekly: 7,
    bisemanal: 14,
    quincenal: 15,
    monthly: 30,
};
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
        termUnit: 'months' as 'months' | 'weeks',
        frequency: 'monthly' as PaymentFrequency,
        startDate: todayBogota(),
        businessId: selectedBusinessId || '',
    });

    // Convierte el plazo ingresado (en la unidad elegida) a días
    const termValueToDays = (value: number, unit: 'months' | 'weeks') =>
        unit === 'weeks' ? value * 7 : value * DAYS_PER_MONTH;
    const [useFixedInstallment, setUseFixedInstallment] = useState(false);
    const [installmentAmount, setInstallmentAmount] = useState('');

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
        const gap = gapDaysMap[frequency] || 7;
        const rateDecimal = interestRate / 100;

        // Calcular pagos por mes para estimar interés por cuota
        let paymentsPerMonth = 1;
        if (frequency === 'weekly') paymentsPerMonth = 4;
        else if (frequency === 'bisemanal' || frequency === 'quincenal') paymentsPerMonth = 2;
        else if (frequency === 'daily') paymentsPerMonth = 30;

        const interestPerPayment = rateDecimal / paymentsPerMonth;

        const denominator = installment - (amount * interestPerPayment);
        const payments = denominator > 0 ? Math.max(1, Math.ceil(amount / denominator)) : Math.ceil(365 / gap);

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
        doc.text(`Monto: $${formData.amount}  Interés: ${formData.interestRate}%  Plazo: ${formData.termMonths} ${formData.termUnit === 'weeks' ? 'semanas' : 'meses'}`, 14, startY + 20);
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
            const termDays = estimateTermDays(amount, interestRate, installment, formData.frequency);
            return { termDays, termMonths: Math.ceil(termDays / 30) };
        }
        return null;
    }, [formData.amount, formData.frequency, formData.interestRate, installmentAmount, useFixedInstallment]);

    const paymentPlanView = useMemo(() => {
        if (!simulation || !Array.isArray(simulation.paymentPlan)) return [];

        return simulation.paymentPlan.map((p, idx) => ({
            installmentNumber: p.installmentNumber ?? idx + 1,
            dueDate: p.dueDate, // Mantener como string/Date retornado por el API
            scheduledAmount: Number(p.scheduledAmount),
        }));
    }, [simulation]);

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

                            {/* Plazo con unidad (semanas / meses) */}
                            <div>
                                <label className="block text-sm font-semibold text-gray-700 mb-1">
                                    Plazo ({formData.termUnit === 'weeks' ? 'semanas' : 'meses'}) *
                                </label>
                                <div className="flex gap-2">
                                    <input
                                        type="number"
                                        value={formData.termMonths}
                                        onChange={(e) => setFormData({ ...formData, termMonths: e.target.value })}
                                        className="flex-1 px-3 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 text-gray-900"
                                        min="1"
                                        step={formData.termUnit === 'weeks' ? '1' : '0.5'}
                                        placeholder={formData.termUnit === 'weeks' ? '6' : '2'}
                                    />
                                    {/* Selector de unidad */}
                                    <div className="flex rounded-xl border border-gray-300 overflow-hidden shrink-0">
                                        <button
                                            type="button"
                                            onClick={() => setFormData({ ...formData, termUnit: 'weeks' })}
                                            className={`px-3 text-sm font-medium transition ${formData.termUnit === 'weeks' ? 'bg-primary-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
                                        >
                                            Semanas
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setFormData({ ...formData, termUnit: 'months' })}
                                            className={`px-3 text-sm font-medium transition border-l border-gray-300 ${formData.termUnit === 'months' ? 'bg-primary-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
                                        >
                                            Meses
                                        </button>
                                    </div>
                                </div>
                                <p className="text-xs text-gray-500 mt-1">
                                    {formData.termUnit === 'weeks'
                                        ? 'Ej: 6 semanas con frecuencia semanal = 6 cuotas.'
                                        : 'Ej: 2 meses. Si usas cuota fija, el plazo se recalcula automáticamente.'}
                                </p>
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
