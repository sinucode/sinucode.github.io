import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import { getCreditDetail, simulateCredit, updateCreditSchedule } from '../api/credits.api';
import { registerPayment } from '../api/payments.api';
import { useState, useEffect } from 'react';
import PaymentModal from '../components/credits/PaymentModal';
import { CreditDetail, PaymentSchedule, PaymentFrequency } from '../types';
import { ArrowLeft, CheckCircle2, AlertTriangle, Circle, Download, X } from 'lucide-react';
import jsPDF from 'jspdf';
import { useAuthStore } from '../store/authStore';

const statusColors: Record<PaymentSchedule['status'], string> = {
    paid: 'text-green-600 bg-green-50',
    overdue: 'text-red-600 bg-red-50',
    partial: 'text-amber-600 bg-amber-50',
    pending: 'text-gray-600 bg-gray-100',
};

const formatMoney = (val: any) => `$${Math.ceil(Number(val || 0)).toLocaleString('es-CO')}`;
const gapDaysMap: Record<PaymentFrequency, number> = {
    daily: 1,
    weekly: 7,
    biweekly: 15,
    monthly: 30,
};
const DAYS_PER_MONTH = 30; // 1 mes = 30 días (alineado con backend)

export default function CreditDetailPage() {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const [isPaymentOpen, setIsPaymentOpen] = useState(false);
    const [isEditOpen, setIsEditOpen] = useState(false);
    const [quickPaySchedule, setQuickPaySchedule] = useState<PaymentSchedule | null>(null);
    const [editRows, setEditRows] = useState<PaymentSchedule[]>([]);
    const [editError, setEditError] = useState('');
    const { user } = useAuthStore();
    const queryClient = useQueryClient();
    const isSuperAdmin = user?.role === 'super_admin';
    const [editForm, setEditForm] = useState({
        amount: '',
        interestRate: '',
        termValue: '',
        termUnit: 'monthly' as 'daily' | 'weekly' | 'monthly',
        frequency: 'weekly' as PaymentFrequency,
        startDate: '',
        useFixedInstallment: false,
        installmentAmount: '',
    });

    const { data: credit, isLoading, refetch } = useQuery<CreditDetail>({
        queryKey: ['credit', id],
        queryFn: () => getCreditDetail(id!),
        enabled: !!id,
    });

    useEffect(() => {
        if (credit) {
            setEditRows(credit.paymentSchedule);
            const firstDate = credit.paymentSchedule[0]?.dueDate
                ? new Date(credit.paymentSchedule[0].dueDate).toISOString().slice(0, 10)
                : new Date().toISOString().slice(0, 10);
            const freq = credit.paymentFrequency as PaymentFrequency;
            const gap = gapDaysMap[freq] || 30;
            const termValue = Math.ceil((credit.paymentSchedule.length * gap) / DAYS_PER_MONTH);
            setEditForm({
                amount: Math.ceil(Number(credit.amount)).toLocaleString('es-CO'),
                interestRate: String(credit.interestRate),
                termValue: String(termValue),
                termUnit: 'monthly',
                frequency: freq,
                startDate: firstDate,
                useFixedInstallment: false,
                installmentAmount: '',
            });
        }
    }, [credit]);

    const updateMutation = useMutation({
        mutationFn: (payload: any) => updateCreditSchedule(id!, payload),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['credit', id] });
            setIsEditOpen(false);
            setEditError('');
        },
        onError: (err: any) => {
            const errors = err.response?.data?.errors;
            if (Array.isArray(errors) && errors.length > 0) {
                setEditError(errors[0].msg);
                return;
            }
            setEditError(err.response?.data?.error || 'Error al actualizar el plan de pagos');
        },
    });

    if (isLoading || !credit) {
        return <div className="text-gray-600">Cargando crédito...</div>;
    }

    const totalPaid = credit.payments.reduce((acc, p) => acc + Number(p.amount), 0);
    const nextDue = credit.paymentSchedule.find((p) => p.status !== 'paid');

    const renderStatusIcon = (status: PaymentSchedule['status']) => {
        if (status === 'paid') return <CheckCircle2 size={16} />;
        if (status === 'overdue') return <AlertTriangle size={16} />;
        return <Circle size={14} />;
    };

    const parseMoney = (val: string) => Number(val.replace(/[^0-9]/g, '')) || 0;
    const estimateTermDays = (amount: number, interestRate: number, installment: number, frequency: PaymentFrequency) => {
        const gap = gapDaysMap[frequency] || 7;
        const rateDecimal = interestRate / 100;

        // Calcular interés por cuota según frecuencia
        let paymentsPerMonth = 1;
        if (frequency === 'weekly') paymentsPerMonth = 4;
        else if (frequency === 'biweekly') paymentsPerMonth = 2;
        else if (frequency === 'daily') paymentsPerMonth = 30;

        const interestPerPayment = rateDecimal / paymentsPerMonth;

        // Resolver: amount + (amount * interestPerPayment * n) = installment * n
        // amount = installment * n - amount * interestPerPayment * n
        // amount = n * (installment - amount * interestPerPayment)
        // n = amount / (installment - amount * interestPerPayment)
        const numerator = amount;
        const denominator = installment - (amount * interestPerPayment);

        if (denominator <= 0) {
            // La cuota es demasiado pequeña, retornar un valor grande
            return 365; // 1 año como máximo
        }

        const payments = Math.max(1, Math.ceil(numerator / denominator));
        return payments * gap;
    };

    const termDaysFromUnit = (value: number, unit: 'daily' | 'weekly' | 'monthly', frequency: PaymentFrequency) => {
        if (Number.isNaN(value) || value <= 0) return 0;

        // Si la unidad es meses, calcular basado en la frecuencia de pago
        if (unit === 'monthly') {
            // 1 mes = 4 semanas, 2 quincenas, o 1 mensualidad
            let paymentsPerMonth = 1;
            if (frequency === 'weekly') paymentsPerMonth = 4;
            else if (frequency === 'biweekly') paymentsPerMonth = 2;
            else if (frequency === 'daily') paymentsPerMonth = 30;

            const totalPayments = value * paymentsPerMonth;
            return totalPayments * gapDaysMap[frequency];
        }

        // Para otras unidades, conversión directa
        if (unit === 'daily') return value;
        if (unit === 'weekly') return value * 7;
        return value * 30;
    };

    const handleSimulateEdit = async () => {
        if (!credit) return;
        setEditError('');
        const amount = parseMoney(editForm.amount);
        const interestRate = Number(editForm.interestRate);
        const installment = parseMoney(editForm.installmentAmount);
        const gapDays = gapDaysMap[editForm.frequency] || 7;
        const termValueNum = Number(editForm.termValue);
        let termDays = termDaysFromUnit(termValueNum, editForm.termUnit, editForm.frequency);
        const paidCount = credit.paymentSchedule.filter((s) => Number(s.paidAmount) > 0).length;

        if (editForm.useFixedInstallment && installment > 0) {
            termDays = estimateTermDays(amount, interestRate, installment, editForm.frequency);
        } else if (editForm.useFixedInstallment && installment <= 0) {
            setEditError('Ingresa una cuota deseada válida');
            return;
        }

        // Calcular el número de cuotas objetivo
        let targetCount = Math.max(paidCount, Math.max(1, Math.ceil(termDays / gapDays)));
        if (editForm.useFixedInstallment && installment > 0) {
            // Calcular interés por cuota con nueva fórmula
            const rateDecimal = interestRate / 100;
            let paymentsPerMonth = 1;
            if (editForm.frequency === 'weekly') paymentsPerMonth = 4;
            else if (editForm.frequency === 'biweekly') paymentsPerMonth = 2;
            else if (editForm.frequency === 'daily') paymentsPerMonth = 30;

            const interestPerPayment = rateDecimal / paymentsPerMonth;

            // Resolver cuántas cuotas se necesitan
            const numerator = amount;
            const denominator = installment - (amount * interestPerPayment);
            const desiredCount = denominator > 0 ? Math.max(1, Math.ceil(numerator / denominator)) : 1;

            targetCount = Math.max(paidCount, desiredCount);
            termDays = targetCount * gapDays;
        }

        if (!amount || !interestRate || !termDays) {
            setEditError('Completa monto, interés y plazo');
            return;
        }

        let simulation;
        try {
            simulation = await simulateCredit({
                amount,
                interestRate,
                termDays,
                frequency: editForm.frequency,
                startDate: editForm.startDate,
            });
        } catch (err: any) {
            setEditError(err?.response?.data?.error || 'Error al simular el crédito');
            return;
        }

        // Calcular el total correcto con nueva fórmula
        const rateDecimal = interestRate / 100;
        let paymentsPerMonth = 1;
        if (editForm.frequency === 'weekly') paymentsPerMonth = 4;
        else if (editForm.frequency === 'biweekly') paymentsPerMonth = 2;
        else if (editForm.frequency === 'daily') paymentsPerMonth = 30;

        const interestPerPayment = rateDecimal / paymentsPerMonth;
        const baseTotal = Math.ceil(amount * (1 + interestPerPayment * targetCount));

        if (editForm.useFixedInstallment && installment > 0) {
            const desiredCount = Math.max(1, Math.ceil(baseTotal / installment));
            targetCount = Math.max(paidCount, desiredCount);
            termDays = targetCount * gapDays;
        }

        const total = editForm.useFixedInstallment && installment > 0 ? targetCount * installment : baseTotal;
        const base = Math.floor(total / targetCount);
        const remainder = total - base * targetCount;
        const start = editForm.startDate ? new Date(editForm.startDate) : new Date();

        const plan = Array.from({ length: targetCount }).map((_, idx) => {
            const due = new Date(start);
            due.setDate(start.getDate() + gapDays * idx);
            const amountForRow = base + (idx === targetCount - 1 ? remainder : 0);
            // Si existe cuota simulada y coincide en índice, usar su monto/fecha como referencia
            const simRow = simulation.paymentPlan[idx];
            const useDue = simRow?.dueDate ? new Date(simRow.dueDate) : due;
            return {
                installmentNumber: idx + 1,
                dueDate: useDue.toISOString(),
                scheduledAmount: simRow?.scheduledAmount ?? amountForRow,
            };
        });

        const sortedExisting = [...credit.paymentSchedule].sort((a, b) => (a.installmentNumber ?? 0) - (b.installmentNumber ?? 0));
        const newRows = Array.from({ length: targetCount }).map((_, idx) => {
            const sim = plan[idx];
            const existing = sortedExisting[idx];
            const status = existing?.status || 'pending';
            const paidAmount = existing?.paidAmount || 0;
            return {
                ...(existing || {}),
                id: existing?.id,
                installmentNumber: idx + 1,
                dueDate: sim?.dueDate || existing?.dueDate || new Date().toISOString(),
                scheduledAmount: sim?.scheduledAmount ?? existing?.scheduledAmount ?? 0,
                paidAmount,
                status,
            } as any;
        });
        setEditError('');
        setEditRows(newRows);
    };

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <button
                    onClick={() => navigate(-1)}
                    className="text-sm text-gray-600 hover:text-primary-600 flex items-center gap-2"
                >
                    <ArrowLeft size={16} /> Volver
                </button>
                <div className="flex items-center gap-2">
                    {isSuperAdmin && (
                        <button
                            onClick={() => {
                                setEditError('');
                                setEditRows(credit.paymentSchedule);
                                setIsEditOpen(true);
                            }}
                            className="px-4 py-2 bg-amber-100 text-amber-700 rounded-md hover:bg-amber-200 text-sm font-medium"
                        >
                            Editar plan
                        </button>
                    )}
                    <button
                        onClick={() => setIsPaymentOpen(true)}
                        className="px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700"
                    >
                        Registrar Pago
                    </button>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <SummaryCard title="Total Prestado" value={formatMoney(credit.amount)} />
                <SummaryCard title="Total Pagado" value={formatMoney(totalPaid)} />
                <SummaryCard title="Saldo Pendiente" value={formatMoney(credit.remainingBalance)} />
            </div>

            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 space-y-4">
                <div className="flex flex-wrap gap-4 text-sm text-gray-700">
                    <span><strong>Cliente:</strong> {credit.client?.fullName}</span>
                    <span><strong>Interés:</strong> {credit.interestRate}%</span>
                    <span><strong>Frecuencia:</strong> {credit.paymentFrequency}</span>
                    <span><strong>Próximo vencimiento:</strong> {nextDue ? new Date(nextDue.dueDate).toLocaleDateString() : '-'}</span>
                    <span><strong>Estado:</strong> {credit.status}</span>
                </div>

                <div>
                    <h3 className="text-sm font-semibold text-gray-700 mb-2">Plan de pagos</h3>
                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-sm">
                            <thead className="bg-gray-50 text-gray-700">
                                <tr>
                                    <th className="px-3 py-2">#</th>
                                    <th className="px-3 py-2">Fecha</th>
                                    <th className="px-3 py-2">Monto</th>
                                    <th className="px-3 py-2">Pagado</th>
                                    <th className="px-3 py-2">Estado</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y">
                                {credit.paymentSchedule.map((p, idx) => (
                                    <tr key={p.id} className={idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                                        <td className="px-3 py-2 text-gray-900">{p.installmentNumber}</td>
                                        <td className="px-3 py-2 text-gray-900">{new Date(p.dueDate).toLocaleDateString()}</td>
                                        <td className="px-3 py-2 text-gray-900">{formatMoney(p.scheduledAmount)}</td>
                                        <td className="px-3 py-2 text-gray-900">{formatMoney(p.paidAmount)}</td>
                                        <td className="px-3 py-2">
                                            <button
                                                onClick={() => p.status !== 'paid' && setQuickPaySchedule(p)}
                                                disabled={p.status === 'paid'}
                                                className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${p.status === 'paid'
                                                    ? statusColors.paid
                                                    : 'text-gray-600 bg-gray-100'
                                                    } ${p.status !== 'paid' ? 'cursor-pointer hover:opacity-80' : 'cursor-not-allowed'}`}
                                            >
                                                {renderStatusIcon(p.status === 'paid' ? 'paid' : 'pending')}
                                                {p.status === 'paid' ? 'paid' : 'pending'}
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                                {credit.paymentSchedule.length === 0 && (
                                    <tr>
                                        <td className="px-3 py-3 text-gray-500" colSpan={5}>Sin cuotas registradas</td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>

                <div className="p-6">
                    <h2 className="text-lg font-semibold text-gray-900 mb-4">
                        Pagos ({credit.paymentSchedule?.filter(s => s.status === 'paid' || Number(s.paidAmount) >= Number(s.scheduledAmount)).length || 0} cuotas pagadas)
                    </h2>
                    <div className="overflow-x-auto">
                        <table className="min-w-full divide-y divide-gray-200">
                            <thead>
                                <tr className="bg-gray-50">
                                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Fecha</th>
                                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Monto</th>
                                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Método</th>
                                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Notas</th>
                                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Recibo</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y">
                                {(() => {
                                    // 1. Obtener cuotas pagadas (con limpieza de estado y verificación de montos)
                                    const paidSchedules = (credit.paymentSchedule || [])
                                        .filter((s: any) => {
                                            const statusPaid = s.status && s.status.toString().toLowerCase().trim() === 'paid';
                                            const amountPaid = Number(s.paidAmount) >= Number(s.scheduledAmount) && Number(s.scheduledAmount) > 0;
                                            return statusPaid || amountPaid;
                                        })
                                        .sort((a: any, b: any) => a.installmentNumber - b.installmentNumber);

                                    // 2. Obtener pagos válidos ordenados por fecha
                                    let validPayments = (credit.payments || [])
                                        .filter((p: any) => p && p.id && p.paymentDate && p.amount)
                                        .sort((a: any, b: any) => new Date(a.paymentDate).getTime() - new Date(b.paymentDate).getTime());

                                    // 3. Lógica de corrección para duplicados:
                                    // Si hay cuotas pagadas, limitar estrictamente.
                                    if (paidSchedules.length > 0) {
                                        const limit = Math.min(validPayments.length, paidSchedules.length);
                                        validPayments = validPayments.slice(0, limit);
                                    }

                                    const totalInstallments = credit.paymentSchedule?.length || 0;
                                    const paidInstallmentsCount = paidSchedules.length;
                                    const remainingInstallments = totalInstallments - paidInstallmentsCount;

                                    return validPayments.map((p: any, index: number) => {
                                        // 4. Intentar vincular pago con cuota
                                        // Primero por ID explícito
                                        let relatedSchedule = p.scheduleId
                                            ? credit.paymentSchedule?.find(s => s.id === p.scheduleId)
                                            : null;

                                        // Si no tiene ID explícito, vincular virtualmente con la cuota pagada correspondiente al índice
                                        // (Asumiendo orden cronológico: Pago 1 -> Cuota 1, Pago 2 -> Cuota 2)
                                        if (!relatedSchedule && index < paidSchedules.length) {
                                            relatedSchedule = paidSchedules[index];
                                        }

                                        return (
                                            <tr key={p.id}>
                                                <td className="px-3 py-2">{new Date(p.paymentDate).toLocaleDateString()}</td>
                                                <td className="px-3 py-2">{formatMoney(p.amount)}</td>
                                                <td className="px-3 py-2">{p.paymentMethod || '-'}</td>
                                                <td className="px-3 py-2">{p.notes || '-'}</td>
                                                <td className="px-3 py-2">
                                                    <button
                                                        onClick={() => {
                                                            const doc = new jsPDF();

                                                            // Encabezado
                                                            doc.setFontSize(16);
                                                            doc.setFont('helvetica', 'bold');
                                                            doc.text('RECIBO DE PAGO', 105, 20, { align: 'center' });

                                                            doc.setFontSize(10);
                                                            doc.setFont('helvetica', 'normal');
                                                            doc.text(`ID: ${p.id.slice(0, 8)}...`, 105, 28, { align: 'center' });

                                                            // Línea separadora
                                                            doc.line(14, 32, 196, 32);

                                                            // Información del Cliente
                                                            doc.setFontSize(11);
                                                            doc.setFont('helvetica', 'bold');
                                                            doc.text('CLIENTE', 14, 40);
                                                            doc.setFont('helvetica', 'normal');
                                                            doc.setFontSize(10);
                                                            doc.text(`Nombre: ${credit.client?.fullName || 'N/A'}`, 14, 46);
                                                            doc.text(`Crédito ID: ${credit.id.slice(0, 12)}...`, 14, 52);

                                                            // Información del Pago
                                                            doc.setFontSize(11);
                                                            doc.setFont('helvetica', 'bold');
                                                            doc.text('DETALLES DEL PAGO', 14, 64);
                                                            doc.setFont('helvetica', 'normal');
                                                            doc.setFontSize(10);
                                                            doc.text(`Fecha: ${new Date(p.paymentDate).toLocaleDateString('es-CO', {
                                                                day: '2-digit',
                                                                month: 'long',
                                                                year: 'numeric'
                                                            })}`, 14, 70);
                                                            doc.setFont('helvetica', 'bold');
                                                            doc.setFontSize(12);
                                                            doc.text(`Monto: ${formatMoney(p.amount)}`, 14, 78);
                                                            doc.setFont('helvetica', 'normal');
                                                            doc.setFontSize(10);
                                                            doc.text(`Método: ${p.paymentMethod || 'Efectivo'}`, 14, 84);
                                                            if (p.notes) {
                                                                doc.text(`Notas: ${p.notes}`, 14, 90);
                                                            }

                                                            // Información de Cuotas
                                                            doc.setFontSize(11);
                                                            doc.setFont('helvetica', 'bold');
                                                            doc.text('INFORMACIÓN DE CUOTAS', 14, 102);
                                                            doc.setFont('helvetica', 'normal');
                                                            doc.setFontSize(10);

                                                            if (relatedSchedule) {
                                                                doc.text(`Cuota #${relatedSchedule.installmentNumber} de ${totalInstallments}`, 14, 108);
                                                            } else {
                                                                doc.text(`Total de cuotas: ${totalInstallments}`, 14, 108);
                                                            }

                                                            doc.text(`Cuotas pagadas: ${paidInstallmentsCount}`, 14, 114);
                                                            doc.text(`Cuotas pendientes: ${remainingInstallments}`, 14, 120);
                                                            doc.text(`Saldo restante: ${formatMoney(credit.remainingBalance)}`, 14, 126);

                                                            // Línea separadora
                                                            doc.line(14, 134, 196, 134);

                                                            // Footer
                                                            doc.setFontSize(8);
                                                            doc.text(`Generado: ${new Date().toLocaleString('es-CO')}`, 14, 145);
                                                            doc.text('GestiónCrediFácil - Sistema de Gestión de Créditos', 105, 145, { align: 'center' });

                                                            doc.save(`recibo-${new Date(p.paymentDate).toLocaleDateString('es-CO').replace(/\//g, '-')}-${formatMoney(p.amount).replace(/[^0-9]/g, '')}.pdf`);
                                                        }}
                                                        className="text-primary-600 hover:text-primary-800 text-sm"
                                                    >
                                                        Imprimir
                                                    </button>
                                                </td>
                                            </tr>
                                        );
                                    });
                                })()}
                                {(!credit.payments || credit.payments.filter(p => p && p.id && p.paymentDate && p.amount).length === 0) && (
                                    <tr>
                                        <td className="px-3 py-3 text-gray-500" colSpan={5}>Sin pagos registrados</td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

            {isPaymentOpen && (
                <PaymentModal
                    creditId={credit.id}
                    maxAmount={Number(credit.remainingBalance)}
                    remainingBalance={Number(credit.remainingBalance)}
                    paymentSchedule={credit.paymentSchedule}
                    onClose={() => setIsPaymentOpen(false)}
                    onSuccess={() => {
                        setIsPaymentOpen(false);
                        refetch();
                    }}
                />
            )}

            {quickPaySchedule && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
                    <QuickPayDialog
                        schedule={quickPaySchedule}
                        creditId={credit.id}
                        onClose={() => setQuickPaySchedule(null)}
                        onSuccess={() => {
                            setQuickPaySchedule(null);
                            refetch();
                        }}
                    />
                </div>
            )}



            {isEditOpen && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
                    <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-y-auto">
                        <div className="flex items-center justify-between p-5 border-b">
                            <h3 className="text-lg font-semibold text-gray-800">Editar plan de pagos</h3>
                            <button onClick={() => setIsEditOpen(false)} className="text-gray-500 hover:text-gray-700">
                                <X size={20} />
                            </button>
                        </div>
                        <div className="p-5 space-y-4">
                            {editError && <div className="bg-red-50 text-red-600 p-3 rounded-md text-sm">{editError}</div>}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Monto *</label>
                                    <input
                                        type="text"
                                        value={editForm.amount}
                                        onChange={(e) => {
                                            const raw = e.target.value.replace(/[^0-9]/g, '');
                                            const formatted = raw ? Number(raw).toLocaleString('es-CO') : '';
                                            setEditForm((prev) => ({ ...prev, amount: formatted }));
                                        }}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Interés (%) *</label>
                                    <input
                                        type="number"
                                        value={editForm.interestRate}
                                        onChange={(e) => setEditForm((prev) => ({ ...prev, interestRate: e.target.value }))}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
                                        min="0"
                                        step="0.01"
                                    />
                                </div>
                                <div className="grid grid-cols-12 gap-2">
                                    <div className="col-span-7">
                                        <label className="block text-sm font-medium text-gray-700 mb-1">Plazo</label>
                                        <input
                                            type="number"
                                            value={editForm.termValue}
                                            onChange={(e) => setEditForm((prev) => ({ ...prev, termValue: e.target.value }))}
                                            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
                                            min="1"
                                            step="1"
                                        />
                                    </div>
                                    <div className="col-span-5">
                                        <label className="block text-sm font-medium text-gray-700 mb-1">Unidad</label>
                                        <select
                                            value={editForm.termUnit}
                                            onChange={(e) => setEditForm((prev) => ({ ...prev, termUnit: e.target.value as any }))}
                                            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
                                        >
                                            <option value="daily">Días</option>
                                            <option value="weekly">Semanas</option>
                                            <option value="monthly">Meses</option>
                                        </select>
                                    </div>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Frecuencia</label>
                                    <select
                                        value={editForm.frequency}
                                        onChange={(e) => setEditForm((prev) => ({ ...prev, frequency: e.target.value as PaymentFrequency }))}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
                                    >
                                        <option value="daily">Diario</option>
                                        <option value="weekly">Semanal</option>
                                        <option value="biweekly">Quincenal</option>
                                        <option value="monthly">Mensual</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Fecha de inicio</label>
                                    <input
                                        type="date"
                                        value={editForm.startDate}
                                        onChange={(e) => setEditForm((prev) => ({ ...prev, startDate: e.target.value }))}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
                                    />
                                </div>
                                <div className="md:col-span-1">
                                    <label className="inline-flex items-center gap-2 text-sm text-gray-800 mb-1">
                                        <input
                                            type="checkbox"
                                            checked={editForm.useFixedInstallment}
                                            onChange={(e) => setEditForm((prev) => ({ ...prev, useFixedInstallment: e.target.checked }))}
                                            className="w-4 h-4 text-primary-600 border-gray-300 rounded"
                                        />
                                        Usar cuota fija
                                    </label>
                                    <input
                                        type="text"
                                        value={editForm.installmentAmount}
                                        onChange={(e) => {
                                            const raw = e.target.value.replace(/[^0-9]/g, '');
                                            const formatted = raw ? Number(raw).toLocaleString('es-CO') : '';
                                            setEditForm((prev) => ({ ...prev, installmentAmount: formatted }));
                                        }}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
                                        placeholder="Ej: 100.000"
                                        disabled={!editForm.useFixedInstallment}
                                    />
                                </div>
                            </div>
                            <div className="flex justify-end">
                                <button
                                    onClick={handleSimulateEdit}
                                    className="px-4 py-2 bg-gray-100 text-gray-800 rounded-md hover:bg-gray-200 text-sm"
                                    type="button"
                                >
                                    Simular nuevo plan
                                </button>
                            </div>
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm text-left">
                                    <thead className="bg-gray-50 text-gray-600">
                                        <tr>
                                            <th className="px-3 py-2">#</th>
                                            <th className="px-3 py-2">Fecha</th>
                                            <th className="px-3 py-2">Monto</th>
                                            <th className="px-3 py-2">Pagado</th>
                                            <th className="px-3 py-2">Estado</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y">
                                        {editRows.map((row, idx) => (
                                            <tr key={row.id || idx} className="text-gray-800">
                                                <td className="px-3 py-2 text-gray-900 font-medium">{row.installmentNumber ?? idx + 1}</td>
                                                <td className="px-3 py-2">
                                                    <input
                                                        type="date"
                                                        value={new Date(row.dueDate).toISOString().slice(0, 10)}
                                                        onChange={(e) =>
                                                            setEditRows((prev) =>
                                                                prev.map((r, i) =>
                                                                    i === idx ? { ...r, dueDate: e.target.value as any } : r
                                                                )
                                                            )
                                                        }
                                                        className="px-2 py-1 border border-gray-300 rounded-md bg-white text-gray-900"
                                                    />
                                                </td>
                                                <td className="px-3 py-2">
                                                    <input
                                                        type="text"
                                                        value={Math.ceil(Number(row.scheduledAmount || 0)).toLocaleString('es-CO')}
                                                        onChange={(e) => {
                                                            const raw = e.target.value.replace(/[^0-9]/g, '');
                                                            const num = raw ? Number(raw) : 0;
                                                            setEditRows((prev) =>
                                                                prev.map((r, i) =>
                                                                    i === idx ? { ...r, scheduledAmount: num as any } : r
                                                                )
                                                            );
                                                        }}
                                                        className="px-2 py-1 border border-gray-300 rounded-md bg-white text-gray-900"
                                                    />
                                                </td>
                                                <td className="px-3 py-2 text-gray-700">{formatMoney(row.paidAmount)}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                    <tfoot className="border-t-2 border-gray-300 bg-gray-50 font-semibold">
                                        <tr>
                                            <td colSpan={2} className="px-3 py-3 text-right text-gray-700">Total de cuotas:</td>
                                            <td className="px-3 py-3 text-gray-900">
                                                {formatMoney(editRows.reduce((sum, r) => sum + Number(r.scheduledAmount || 0), 0))}
                                            </td>
                                            <td></td>
                                        </tr>
                                        <tr>
                                            <td colSpan={2} className="px-3 py-3 text-right text-gray-700">Total pagado:</td>
                                            <td className="px-3 py-3 text-gray-900">
                                                {formatMoney(editRows.reduce((sum, r) => sum + Number(r.paidAmount || 0), 0))}
                                            </td>
                                            <td></td>
                                        </tr>
                                    </tfoot>
                                </table>
                            </div>
                            <div className="flex justify-end gap-3 pt-2">
                                <button
                                    onClick={() => setIsEditOpen(false)}
                                    className="px-4 py-2 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200"
                                >
                                    Cancelar
                                </button>
                                <button
                                    onClick={() => {
                                        setEditError('');
                                        const payload = editRows.map((r, idx) => ({
                                            id: r.id,
                                            dueDate: new Date(r.dueDate).toISOString(),
                                            scheduledAmount: Math.ceil(Number(r.scheduledAmount || 0)),
                                            installmentNumber: r.installmentNumber || idx + 1,
                                        }));
                                        updateMutation.mutate({ schedules: payload });
                                    }}
                                    disabled={updateMutation.isPending}
                                    className="px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700 disabled:opacity-50"
                                >
                                    {updateMutation.isPending ? 'Guardando...' : 'Guardar cambios'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

function SummaryCard({ title, value }: { title: string; value: string }) {
    return (
        <div className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm">
            <p className="text-sm text-gray-500">{title}</p>
            <p className="text-xl font-semibold text-gray-800">{value}</p>
        </div>
    );
}

function QuickPayDialog({
    schedule,
    creditId,
    onClose,
    onSuccess,
}: {
    schedule: PaymentSchedule;
    creditId: string;
    onClose: () => void;
    onSuccess: () => void;
}) {
    const queryClient = useQueryClient();
    const formatMoney = (val: any) => `$${Math.ceil(Number(val || 0)).toLocaleString('es-CO')}`;

    const paymentMutation = useMutation({
        mutationFn: (payload: { creditId: string; amount: number; scheduleId: string; paymentMethod: string }) =>
            registerPayment(payload),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['credit', creditId] });
            onSuccess();
        },
        onError: (err: any) => {
            alert(err?.response?.data?.error || 'Error al registrar el pago');
        },
    });

    const pending = Number(schedule.scheduledAmount) - Number(schedule.paidAmount);

    return (
        <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
            <h3 className="text-lg font-semibold text-gray-800 mb-4">Confirmar Pago de Cuota</h3>
            <p className="text-gray-600 mb-6">
                ¿Desea registrar el pago completo de la cuota #{schedule.installmentNumber} por{' '}
                <strong>{formatMoney(pending)}</strong>?
            </p>
            <div className="flex justify-end gap-3">
                <button
                    onClick={onClose}
                    disabled={paymentMutation.isPending}
                    className="px-4 py-2 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 disabled:opacity-50"
                >
                    Cancelar
                </button>
                <button
                    onClick={() =>
                        paymentMutation.mutate({
                            creditId,
                            amount: pending,
                            scheduleId: schedule.id,
                            paymentMethod: 'efectivo',
                        })
                    }
                    disabled={paymentMutation.isPending}
                    className="px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                >
                    {paymentMutation.isPending ? (
                        <>
                            <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                                <path
                                    className="opacity-75"
                                    fill="currentColor"
                                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                                />
                            </svg>
                            Procesando...
                        </>
                    ) : (
                        'Confirmar Pago'
                    )}
                </button>
            </div>
        </div>
    );
}
