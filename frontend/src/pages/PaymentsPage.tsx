import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { useErrorModal } from '../context/ErrorModalContext';
import {
    CreditCard, Filter, Search, Download, FileText,
    ExternalLink, MessageCircle, Printer, X
} from 'lucide-react';
import { Payment } from '../types';
import { getPayments } from '../api/payments.api';
import { useAuthStore } from '../store/authStore';
import { getBusinesses } from '../api/business.api';
import { useBusinessStore } from '../store/businessStore';
import { formatDateTime } from '../utils/dates';
import { exportToCsv } from '../utils/exportCsv';
import { generateReceipt, generateBatchReceipts } from '../utils/generateReceipt';
import api from '../lib/axios';

const formatMoney = (val: any) => `$${Math.ceil(Number(val || 0)).toLocaleString('es-CO')}`;

type PaymentType = 'cuota_completa' | 'abono_parcial' | 'donacion';

const getPaymentType = (p: Payment): PaymentType => {
    if (Number(p.amountToInterest || 0) > 0) return 'donacion';
    // Si el saldo después es 0 y el monto = cuota programada típica → cuota completa
    // Simplificación: si pagó >= que el promedio de cuota del crédito = cuota completa
    const credit = p.credit;
    if (credit?.paymentSchedule && credit.paymentSchedule.length > 0) {
        const avgCuota = Number(credit.totalWithInterest) / credit.paymentSchedule.length;
        if (Number(p.amount) >= avgCuota * 0.95) return 'cuota_completa';
    }
    return 'abono_parcial';
};

const typeBadge = (type: PaymentType) => {
    const styles: Record<PaymentType, string> = {
        cuota_completa: 'bg-blue-100 text-blue-700 border-blue-200',
        abono_parcial: 'bg-amber-100 text-amber-700 border-amber-200',
        donacion: 'bg-emerald-100 text-emerald-700 border-emerald-200',
    };
    const labels: Record<PaymentType, string> = {
        cuota_completa: 'Cuota',
        abono_parcial: 'Abono',
        donacion: 'Donación',
    };
    return (
        <span className={`inline-block px-2 py-0.5 text-xs font-medium rounded border ${styles[type]}`}>
            {labels[type]}
        </span>
    );
};

const getCuotaInfo = (p: Payment): string => {
    const credit = p.credit;
    if (!credit?.paymentSchedule) return '—';
    const total = credit.paymentSchedule.length;
    // Si el pago está vinculado a una cuota específica, mostrar el número
    if (p.scheduleId) {
        const cuota = credit.paymentSchedule.find(s => s.id === p.scheduleId);
        if (cuota) return `Cuota #${cuota.installmentNumber} de ${total}`;
    }
    return `de ${total}`;
};

const buildWhatsappLink = (phone: string | undefined, payment: Payment): string => {
    if (!phone) return '';
    const cleaned = phone.replace(/\D/g, '');
    const withCountry = cleaned.startsWith('57') ? cleaned : `57${cleaned}`;
    const clientName = payment.credit?.client?.fullName || 'Cliente';
    const fecha = new Date(payment.paymentDate).toLocaleDateString('es-CO');
    const msg = `Hola ${clientName}, confirmamos tu pago de ${formatMoney(payment.amount)} recibido el ${fecha}. ¡Gracias!`;
    return `https://wa.me/${withCountry}?text=${encodeURIComponent(msg)}`;
};

export default function PaymentsPage() {
    const { user } = useAuthStore();
    const navigate = useNavigate();
    const queryClient = useQueryClient();
    const { showError } = useErrorModal();
    const isSuperAdmin = user?.role === 'super_admin';
    const { selectedBusinessId: businessId, setSelectedBusiness } = useBusinessStore();

    const [methodFilter, setMethodFilter] = useState<string>('all');
    const [typeFilter, setTypeFilter] = useState<string>('all');
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [search, setSearch] = useState('');
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [revertModal, setRevertModal] = useState<Payment | null>(null);
    const [reverting, setReverting] = useState(false);
    const [revertSuccess, setRevertSuccess] = useState('');

    const { data: businesses } = useQuery({
        queryKey: ['businesses'],
        queryFn: getBusinesses,
        enabled: isSuperAdmin,
    });

    const { data: payments, isLoading } = useQuery<Payment[]>({
        queryKey: ['payments', businessId, methodFilter, startDate, endDate],
        queryFn: () => getPayments({
            businessId: businessId || undefined,
            paymentMethod: methodFilter === 'all' ? undefined : methodFilter,
            startDate: startDate || undefined,
            endDate: endDate || undefined,
        }),
    });

    // Filtro local por búsqueda y tipo
    const filtered = useMemo(() => {
        let result = payments || [];
        if (search.trim()) {
            const q = search.toLowerCase();
            result = result.filter(p => {
                const name = p.credit?.client?.fullName?.toLowerCase() || '';
                const cedula = p.credit?.client?.cedula?.toLowerCase() || '';
                return name.includes(q) || cedula.includes(q);
            });
        }
        if (typeFilter !== 'all') {
            result = result.filter(p => getPaymentType(p) === typeFilter);
        }
        return result;
    }, [payments, search, typeFilter]);

    const totals = useMemo(() => {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const weekAgo = new Date(today);
        weekAgo.setDate(weekAgo.getDate() - 6);

        let incomeToday = 0;
        let incomeWeek = 0;
        let total = 0;
        let donaciones = 0;
        const methodMap: Record<string, number> = {};

        filtered.forEach(p => {
            const date = new Date(p.paymentDate);
            const amount = Number(p.amount);
            total += amount;
            if (date >= today) incomeToday += amount;
            if (date >= weekAgo) incomeWeek += amount;
            donaciones += Number(p.amountToInterest || 0);
            const method = p.paymentMethod || 'otro';
            methodMap[method] = (methodMap[method] || 0) + amount;
        });

        return { incomeToday, incomeWeek, total, donaciones, methodMap };
    }, [filtered]);

    const toggleSelect = (id: string) => {
        setSelectedIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    const toggleSelectAll = () => {
        if (selectedIds.size === filtered.length) {
            setSelectedIds(new Set());
        } else {
            setSelectedIds(new Set(filtered.map(p => p.id)));
        }
    };

    const handleExportCsv = () => {
        exportToCsv(`pagos-${new Date().toISOString().slice(0, 10)}.csv`, filtered, [
            { header: 'Fecha', accessor: p => formatDateTime(p.paymentDate) },
            { header: 'Cliente', accessor: p => p.credit?.client?.fullName || '' },
            { header: 'Cédula', accessor: p => p.credit?.client?.cedula || '' },
            { header: 'Crédito', accessor: p => p.creditId.slice(0, 8) },
            { header: 'Monto', accessor: p => Number(p.amount) },
            { header: 'A capital', accessor: p => Number(p.amountToPrincipal) },
            { header: 'Donación', accessor: p => Number(p.amountToInterest || 0) },
            { header: 'Saldo después', accessor: p => Number(p.remainingBalanceAfter) },
            { header: 'Método', accessor: p => p.paymentMethod || '' },
            { header: 'Tipo', accessor: p => getPaymentType(p) },
            { header: 'Cobrador', accessor: p => p.createdBy?.fullName || '' },
            { header: 'Notas', accessor: p => p.notes || '' },
        ]);
    };

    const handleBatchPrint = () => {
        const selected = filtered.filter(p => selectedIds.has(p.id));
        generateBatchReceipts(selected);
    };

    const revertMutation = useMutation({
        mutationFn: async (payment: Payment) => {
            const credit = payment.credit;
            if (!credit?.paymentSchedule) throw new Error('No se pueden cargar las cuotas del crédito');

            // Estrategia: revertir la cuota más reciente que tenga paidAmount > 0 y status != pending
            const sortedSchedules = [...credit.paymentSchedule].sort((a, b) =>
                b.installmentNumber - a.installmentNumber
            );
            const target = sortedSchedules.find(s => Number(s.paidAmount) > 0);
            if (!target) throw new Error('No hay cuotas con pagos para revertir');

            const amountToRevert = Math.min(Number(payment.amount), Number(target.paidAmount));
            await api.post(`/credits/${payment.creditId}/schedule/${target.id}/revert`, {
                amountToRevert,
            });
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['payments'] });
            queryClient.invalidateQueries({ queryKey: ['credits'] });
            setRevertModal(null);
            setRevertSuccess('Pago revertido. Para reversiones más precisas, ve al detalle del crédito.');
        },
        onError: (err: any) => {
            showError(err);
        },
        onSettled: () => setReverting(false),
    });

    return (
        <div className="space-y-5">
            {/* Header */}
            <header className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                <div className="flex items-center gap-3">
                    <div className="p-3 rounded-lg bg-primary-50 text-primary-700">
                        <CreditCard size={24} />
                    </div>
                    <div>
                        <h1 className="text-2xl font-bold text-gray-800">Pagos</h1>
                        <p className="text-sm text-gray-600">Historial accionable de cobros recibidos</p>
                    </div>
                </div>
            </header>

            {revertSuccess && (
                <div className="bg-green-50 border border-green-200 text-green-700 p-3 rounded-xl text-sm flex items-center gap-2">
                    <span>✓</span> {revertSuccess}
                </div>
            )}

            {/* Filtros */}
            <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
                <div className="flex items-center gap-2 text-sm font-semibold text-gray-700">
                    <Filter size={16} /> Filtros
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2">
                    {isSuperAdmin && (
                        <select
                            value={businessId}
                            onChange={(e) => {
                                const id = e.target.value;
                                const name = id ? businesses?.find(b => b.id === id)?.name || '' : 'Todos los negocios';
                                setSelectedBusiness(id, name);
                            }}
                            className="px-3 py-2 border border-gray-300 rounded-md text-sm"
                        >
                            <option value="">Todos los negocios</option>
                            {businesses?.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                        </select>
                    )}
                    <select
                        value={methodFilter}
                        onChange={(e) => setMethodFilter(e.target.value)}
                        className="px-3 py-2 border border-gray-300 rounded-md text-sm"
                    >
                        <option value="all">Todos los métodos</option>
                        <option value="efectivo">Efectivo</option>
                        <option value="transferencia">Transferencia</option>
                        <option value="cheque">Cheque</option>
                        <option value="otro">Otro</option>
                    </select>
                    <select
                        value={typeFilter}
                        onChange={(e) => setTypeFilter(e.target.value)}
                        className="px-3 py-2 border border-gray-300 rounded-md text-sm"
                    >
                        <option value="all">Todos los tipos</option>
                        <option value="cuota_completa">Cuota completa</option>
                        <option value="abono_parcial">Abono parcial</option>
                        <option value="donacion">Donación</option>
                    </select>
                    <input
                        type="date"
                        value={startDate}
                        onChange={(e) => setStartDate(e.target.value)}
                        className="px-3 py-2 border border-gray-300 rounded-md text-sm"
                        placeholder="Desde"
                    />
                    <input
                        type="date"
                        value={endDate}
                        onChange={(e) => setEndDate(e.target.value)}
                        className="px-3 py-2 border border-gray-300 rounded-md text-sm"
                        placeholder="Hasta"
                    />
                </div>
                <div className="flex items-center gap-2">
                    <div className="relative flex-1">
                        <Search size={14} className="absolute left-3 top-2.5 text-gray-400" />
                        <input
                            type="text"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            placeholder="Buscar por nombre o cédula del cliente..."
                            className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-md text-sm"
                        />
                    </div>
                </div>
            </div>

            {/* KPIs */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <KpiCard title="Cobrado hoy" value={formatMoney(totals.incomeToday)} color="blue" />
                <KpiCard title="Últimos 7 días" value={formatMoney(totals.incomeWeek)} color="emerald" />
                <KpiCard title="Total filtrado" value={formatMoney(totals.total)} color="gray" subtitle={`${filtered.length} pago${filtered.length !== 1 ? 's' : ''}`} />
                <KpiCard title="Donaciones recibidas" value={formatMoney(totals.donaciones)} color="amber" />
            </div>

            {/* Acciones masivas */}
            <div className="flex flex-wrap items-center gap-2 justify-between">
                <div className="text-sm text-gray-600">
                    {selectedIds.size > 0 ? (
                        <span className="font-medium">{selectedIds.size} seleccionado{selectedIds.size !== 1 ? 's' : ''}</span>
                    ) : (
                        <span>Selecciona pagos con el checkbox para generar recibos en lote</span>
                    )}
                </div>
                <div className="flex gap-2">
                    {selectedIds.size > 0 && (
                        <button
                            onClick={handleBatchPrint}
                            className="px-3 py-1.5 bg-blue-600 text-white rounded-md hover:bg-blue-700 text-sm font-medium flex items-center gap-1"
                        >
                            <Printer size={14} /> Recibos PDF ({selectedIds.size})
                        </button>
                    )}
                    <button
                        onClick={handleExportCsv}
                        className="px-3 py-1.5 bg-gray-700 text-white rounded-md hover:bg-gray-800 text-sm font-medium flex items-center gap-1"
                    >
                        <Download size={14} /> Exportar CSV
                    </button>
                </div>
            </div>

            {/* Tabla */}
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead className="bg-gray-50 border-b border-gray-200">
                            <tr>
                                <th className="px-3 py-2 text-left">
                                    <input
                                        type="checkbox"
                                        checked={filtered.length > 0 && selectedIds.size === filtered.length}
                                        onChange={toggleSelectAll}
                                    />
                                </th>
                                <th className="px-3 py-2 text-left text-xs font-semibold text-gray-600 uppercase">Fecha</th>
                                <th className="px-3 py-2 text-left text-xs font-semibold text-gray-600 uppercase">Cliente</th>
                                <th className="px-3 py-2 text-left text-xs font-semibold text-gray-600 uppercase">Monto</th>
                                <th className="px-3 py-2 text-left text-xs font-semibold text-gray-600 uppercase">Tipo</th>
                                <th className="px-3 py-2 text-left text-xs font-semibold text-gray-600 uppercase">Método</th>
                                <th className="px-3 py-2 text-left text-xs font-semibold text-gray-600 uppercase">Cobrador</th>
                                <th className="px-3 py-2 text-left text-xs font-semibold text-gray-600 uppercase">Notas</th>
                                <th className="px-3 py-2 text-right text-xs font-semibold text-gray-600 uppercase">Acciones</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {isLoading ? (
                                <tr><td colSpan={9} className="px-3 py-8 text-center text-gray-500">Cargando pagos...</td></tr>
                            ) : filtered.length === 0 ? (
                                <tr><td colSpan={9} className="px-3 py-8 text-center text-gray-500">Sin pagos en el filtro seleccionado</td></tr>
                            ) : (
                                filtered.map((p) => {
                                    const type = getPaymentType(p);
                                    const clientName = p.credit?.client?.fullName || '—';
                                    const phone = p.credit?.client?.phone;
                                    return (
                                        <tr key={p.id} className="hover:bg-gray-50">
                                            <td className="px-3 py-2">
                                                <input
                                                    type="checkbox"
                                                    checked={selectedIds.has(p.id)}
                                                    onChange={() => toggleSelect(p.id)}
                                                />
                                            </td>
                                            <td className="px-3 py-2 text-gray-600">{formatDateTime(p.paymentDate)}</td>
                                            <td className="px-3 py-2">
                                                <button
                                                    onClick={() => navigate(`/credits/${p.creditId}`)}
                                                    className="font-medium text-primary-600 hover:underline text-left"
                                                >
                                                    {clientName}
                                                </button>
                                                <div className="text-xs text-gray-500">{getCuotaInfo(p)}</div>
                                            </td>
                                            <td className="px-3 py-2 font-semibold text-gray-900">{formatMoney(p.amount)}</td>
                                            <td className="px-3 py-2">{typeBadge(type)}</td>
                                            <td className="px-3 py-2 text-gray-600 capitalize">{p.paymentMethod || '—'}</td>
                                            <td className="px-3 py-2 text-gray-600 text-xs">{p.createdBy?.fullName || '—'}</td>
                                            <td className="px-3 py-2 text-gray-500 text-xs max-w-xs truncate">{p.notes || '—'}</td>
                                            <td className="px-3 py-2">
                                                <div className="flex items-center justify-end gap-1">
                                                    <button
                                                        title="Ver crédito"
                                                        onClick={() => navigate(`/credits/${p.creditId}`)}
                                                        className="p-1.5 text-gray-500 hover:text-primary-600 hover:bg-primary-50 rounded"
                                                    >
                                                        <ExternalLink size={15} />
                                                    </button>
                                                    <button
                                                        title="Imprimir recibo"
                                                        onClick={() => generateReceipt(p)}
                                                        className="p-1.5 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded"
                                                    >
                                                        <FileText size={15} />
                                                    </button>
                                                    {phone && (
                                                        <a
                                                            title="Enviar WhatsApp"
                                                            href={buildWhatsappLink(phone, p)}
                                                            target="_blank"
                                                            rel="noopener noreferrer"
                                                            className="p-1.5 text-gray-500 hover:text-emerald-600 hover:bg-emerald-50 rounded"
                                                        >
                                                            <MessageCircle size={15} />
                                                        </a>
                                                    )}
                                                    {isSuperAdmin && (
                                                        <button
                                                            title="Revertir pago"
                                                            onClick={() => setRevertModal(p)}
                                                            className="p-1.5 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded"
                                                        >
                                                            <X size={15} />
                                                        </button>
                                                    )}
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Modal de reversión */}
            {revertModal && createPortal(
                <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 p-4">
                    <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-5">
                        <h3 className="text-lg font-bold text-red-700 mb-2">Revertir pago</h3>
                        <p className="text-sm text-gray-700 mb-3">
                            Vas a revertir el pago de <b>{formatMoney(revertModal.amount)}</b> de{' '}
                            <b>{revertModal.credit?.client?.fullName}</b> registrado el {' '}
                            {formatDateTime(revertModal.paymentDate)}.
                        </p>
                        <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded p-2 mb-4">
                            ⚠️ Esta acción revierte la cuota más reciente con pago. Para reversiones precisas,
                            usa el detalle del crédito y selecciona la cuota exacta.
                        </p>
                        <div className="flex gap-2">
                            <button
                                onClick={() => setRevertModal(null)}
                                disabled={reverting}
                                className="flex-1 px-4 py-2 bg-gray-100 text-gray-800 rounded-md text-sm font-medium hover:bg-gray-200"
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={() => {
                                    setReverting(true);
                                    revertMutation.mutate(revertModal);
                                }}
                                disabled={reverting}
                                className="flex-1 px-4 py-2 bg-red-600 text-white rounded-md text-sm font-medium hover:bg-red-700 disabled:opacity-50"
                            >
                                {reverting ? 'Revirtiendo...' : 'Confirmar reversión'}
                            </button>
                            <button
                                onClick={() => {
                                    setRevertModal(null);
                                    navigate(`/credits/${revertModal.creditId}`);
                                }}
                                disabled={reverting}
                                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-md text-sm font-medium hover:bg-blue-700"
                            >
                                Ir al crédito
                            </button>
                        </div>
                    </div>
                </div>,
                document.body
            )}
        </div>
    );
}

function KpiCard({ title, value, color, subtitle }: { title: string; value: string; color: string; subtitle?: string }) {
    const colors: Record<string, string> = {
        blue: 'border-l-blue-500',
        emerald: 'border-l-emerald-500',
        gray: 'border-l-gray-500',
        amber: 'border-l-amber-500',
    };
    return (
        <div className={`bg-white rounded-xl border border-gray-200 border-l-4 ${colors[color]} p-3 shadow-sm`}>
            <p className="text-xs text-gray-500 uppercase tracking-wide font-medium">{title}</p>
            <p className="text-xl font-bold text-gray-900 mt-0.5">{value}</p>
            {subtitle && <p className="text-xs text-gray-500 mt-0.5">{subtitle}</p>}
        </div>
    );
}
