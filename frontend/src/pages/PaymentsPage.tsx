import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { ArrowRight, CreditCard, Filter, PieChart, BarChart2 } from 'lucide-react';
import { Payment } from '../types';
import { getPayments } from '../api/payments.api';
import { useAuthStore } from '../store/authStore';
import { getBusinesses } from '../api/business.api';

const formatMoney = (val: any) => `$${Math.ceil(Number(val || 0)).toLocaleString('es-CO')}`;

export default function PaymentsPage() {
    const { user } = useAuthStore();
    const isAdmin = ['admin', 'super_admin'].includes(user?.role || '');
    const [businessId, setBusinessId] = useState('');
    const [methodFilter, setMethodFilter] = useState<string>('all');
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');

    const { data: businesses } = useQuery({
        queryKey: ['businesses'],
        queryFn: getBusinesses,
        enabled: isAdmin,
    });

    const { data: payments } = useQuery<Payment[]>({
        queryKey: ['payments', businessId, methodFilter, startDate, endDate],
        queryFn: () => getPayments({
            businessId: businessId || undefined,
            paymentMethod: methodFilter === 'all' ? undefined : methodFilter,
            startDate: startDate || undefined,
            endDate: endDate || undefined,
        }),
    });

    const filtered = payments || [];

    const totals = useMemo(() => {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        let incomeToday = 0;
        let incomeWeek = 0;
        let total = 0;
        const methodMap: Record<string, number> = {};

        filtered.forEach((p) => {
            const date = new Date(p.paymentDate);
            total += Number(p.amount);
            const diffDays = (Date.now() - date.getTime()) / 86400000;
            if (date >= today) incomeToday += Number(p.amount);
            if (diffDays <= 7) incomeWeek += Number(p.amount);
            methodMap[p.paymentMethod || 'otro'] = (methodMap[p.paymentMethod || 'otro'] || 0) + Number(p.amount);
        });

        return { incomeToday, incomeWeek, total, methodMap };
    }, [filtered]);

    return (
        <div className="space-y-6">
            <header className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                <div className="flex items-center gap-3">
                    <div className="p-3 rounded-lg bg-primary-50 text-primary-700">
                        <CreditCard size={24} />
                    </div>
                    <div>
                        <h1 className="text-2xl font-bold text-gray-800">Pagos</h1>
                        <p className="text-gray-600">Flujo de cobros, métodos y recibos.</p>
                    </div>
                </div>
                <div className="flex items-center gap-2 text-sm text-gray-600">
                    <Filter size={16} />
                    {isAdmin && (
                        <select
                            value={businessId}
                            onChange={(e) => setBusinessId(e.target.value)}
                            className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
                        >
                            <option value="">Todos los negocios</option>
                            {businesses?.map((b) => (
                                <option key={b.id} value={b.id}>{b.name}</option>
                            ))}
                        </select>
                    )}
                    <select
                        value={methodFilter}
                        onChange={(e) => setMethodFilter(e.target.value)}
                        className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
                    >
                        <option value="all">Todos los métodos</option>
                        <option value="efectivo">Efectivo</option>
                        <option value="transferencia">Transferencia</option>
                        <option value="cheque">Cheque</option>
                        <option value="otro">Otro</option>
                    </select>
                    <input
                        type="date"
                        value={startDate}
                        onChange={(e) => setStartDate(e.target.value)}
                        className="px-3 py-2 border border-gray-300 rounded-md"
                    />
                    <input
                        type="date"
                        value={endDate}
                        onChange={(e) => setEndDate(e.target.value)}
                        className="px-3 py-2 border border-gray-300 rounded-md"
                    />
                </div>
            </header>

            <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <KpiCard title="Cobrado hoy" value={formatMoney(totals.incomeToday)} />
                <KpiCard title="Cobrado últimos 7 días" value={formatMoney(totals.incomeWeek)} />
                <KpiCard title="Total filtrado" value={formatMoney(totals.total)} />
            </section>

            <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div className="border border-gray-200 rounded-lg bg-white p-4 space-y-3">
                    <div className="flex items-center gap-2 text-gray-700 font-semibold">
                        <BarChart2 size={18} /> Pagos recientes
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm text-left">
                            <thead className="bg-gray-50 text-gray-600">
                                <tr>
                                    <th className="px-3 py-2">Fecha</th>
                                    <th className="px-3 py-2">Monto</th>
                                    <th className="px-3 py-2">Método</th>
                                    <th className="px-3 py-2">Notas</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y">
                                {filtered.map((p) => (
                                    <tr key={p.id} className="text-gray-800">
                                        <td className="px-3 py-2">{new Date(p.paymentDate).toLocaleDateString()}</td>
                                        <td className="px-3 py-2">{formatMoney(p.amount)}</td>
                                        <td className="px-3 py-2 capitalize">{p.paymentMethod || '-'}</td>
                                        <td className="px-3 py-2">{p.notes || '-'}</td>
                                    </tr>
                                ))}
                                {filtered.length === 0 && (
                                    <tr>
                                        <td className="px-3 py-3 text-center text-gray-500" colSpan={4}>
                                            Sin pagos en el filtro seleccionado
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>

                <div className="border border-gray-200 rounded-lg bg-white p-4 space-y-3">
                    <div className="flex items-center gap-2 text-gray-700 font-semibold">
                        <PieChart size={18} /> Métodos de pago
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                        {Object.entries(totals.methodMap).map(([method, val]) => (
                            <div key={method} className="p-3 rounded-md bg-gray-50 border border-gray-200 flex items-center justify-between">
                                <span className="capitalize text-gray-700">{method}</span>
                                <span className="font-semibold text-gray-900">{formatMoney(val)}</span>
                            </div>
                        ))}
                        {Object.keys(totals.methodMap).length === 0 && (
                            <div className="text-gray-500 text-sm">Sin datos</div>
                        )}
                    </div>
                </div>
            </section>

            <section className="border border-gray-200 rounded-lg bg-white p-4 flex flex-col gap-3">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                        <h2 className="text-lg font-semibold text-gray-800">Alertas de cobro</h2>
                        <p className="text-sm text-gray-600">Próximos pagos y moras</p>
                    </div>
                    <button
                        onClick={() => window.location.assign('/credits')}
                        className="inline-flex items-center gap-2 px-3 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700 text-sm"
                    >
                        Gestionar créditos <ArrowRight size={16} />
                    </button>
                </div>
                <div className="text-sm text-gray-500">
                    Esta sección se nutre del cronograma de cuotas. Integraremos la API de créditos para listar cuotas vencidas y del día.
                </div>
            </section>
        </div>
    );
}

function KpiCard({ title, value }: { title: string; value: string }) {
    return (
        <div className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm">
            <p className="text-sm text-gray-500">{title}</p>
            <p className="text-xl font-semibold text-gray-800">{value}</p>
        </div>
    );
}
