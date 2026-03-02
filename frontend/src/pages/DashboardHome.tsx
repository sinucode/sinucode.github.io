import { useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useAuthStore } from '../store/authStore';
import { getCredits } from '../api/credits.api';
import { getCashFlow } from '../api/cash.api';
import { getBusinesses } from '../api/business.api';
import { useBusinessStore } from '../store/businessStore';
import ColombianCalendar from '../components/dashboard/ColombianCalendar';
import { startOfTodayBogota } from '../utils/dates';

const formatMoney = (val: any) => `$${Math.ceil(Number(val || 0)).toLocaleString('es-CO')}`;

export default function DashboardHome() {
    const { user } = useAuthStore();
    const navigate = useNavigate();
    const isAdmin = ['admin', 'super_admin'].includes(user?.role || '');
    const { selectedBusinessId: businessId, setSelectedBusiness } = useBusinessStore();

    const { data: businesses } = useQuery({
        queryKey: ['businesses'],
        queryFn: getBusinesses,
        enabled: isAdmin,
    });

    useEffect(() => {
        if (isAdmin && businesses && businesses.length > 0 && !businessId) {
            setSelectedBusiness(businesses[0].id, businesses[0].name);
        }
    }, [isAdmin, businesses, businessId, setSelectedBusiness]);

    const { data: credits } = useQuery({
        queryKey: ['credits-dashboard', businessId],
        queryFn: () => getCredits({ businessId }),
        enabled: isAdmin ? !!businessId : true,
    });

    const { data: cashFlow } = useQuery({
        queryKey: ['cash-dashboard', businessId],
        queryFn: () => getCashFlow({ businessId: businessId || '' }),
        enabled: isAdmin ? !!businessId : true,
    });

    const stats = useMemo(() => {
        const now = new Date();
        const mesActualStr = now.toLocaleDateString('en-CA', { timeZone: 'America/Bogota' }).slice(0, 7);

        const pagosDelMes = cashFlow?.movements
            ?.filter((m: any) => {
                if (m.type !== 'payment_received') return false;
                const dateStr = new Date(m.createdAt).toLocaleDateString('en-CA', { timeZone: 'America/Bogota' });
                return dateStr.startsWith(mesActualStr);
            })
            ?.reduce((sum: number, m: any) => sum + Number(m.amount), 0) || 0;

        const carteraActiva = credits
            ?.filter((c: any) => c.status === 'active')
            ?.reduce((sum: number, c: any) => sum + Number(c.remainingBalance || 0), 0) || 0;

        const totalPrestado = credits
            ?.filter((c: any) => c.status === 'active' || c.status === 'overdue')
            ?.reduce((sum: number, c: any) => sum + Number(c.totalWithInterest || c.amount || 0), 0) || 0;

        const activeCredits = credits?.filter((c: any) => c.status === 'active').length || 0;

        let overdueCredits = 0;
        let pagosHoy = 0;

        const startOfBogotaToday = startOfTodayBogota().getTime();
        const endOfBogotaToday = startOfBogotaToday + 24 * 60 * 60 * 1000;

        credits?.forEach((c: any) => {
            if (c.status === 'paid' || c.status === 'cancelled') return;

            // Check if overdue (status is overdue OR any unpaid schedule item is past today AND status is purely 'pending' or 'overdue')
            const isOverdue = c.status === 'overdue' || (c.paymentSchedule && c.paymentSchedule.some((p: any) => {
                if (p.status === 'overdue') return true;
                if (p.status === 'pending') {
                    const pDate = new Date(p.dueDate).getTime();
                    return pDate < startOfBogotaToday;
                }
                return false;
            }));

            if (isOverdue) {
                overdueCredits++;
            }

            // Check if due today (exact match with backend logic)
            const isDueToday = c.paymentSchedule && c.paymentSchedule.some((p: any) => {
                const pDate = new Date(p.dueDate).getTime();
                return pDate >= startOfBogotaToday && pDate < endOfBogotaToday && (p.status === 'pending' || p.status === 'partial' || p.status === 'overdue');
            });

            if (isDueToday) {
                pagosHoy++;
            }
        });

        const gananciaEsperada = credits
            ?.filter((c: any) => c.status === 'active' || c.status === 'overdue')
            ?.reduce((sum: number, c: any) => sum + (Number(c.totalWithInterest || 0) - Number(c.amount || 0)), 0) || 0;

        return { pagosDelMes, carteraActiva, totalPrestado, gananciaEsperada, activeCredits, overdueCredits, pagosHoy };
    }, [credits, cashFlow]);

    return (
        <div className="space-y-6">
            {/* Welcome Card */}
            <div className="bg-gradient-to-r from-primary-600 to-primary-800 rounded-lg shadow-lg p-6 text-white">
                <div className="flex items-center justify-between">
                    <div>
                        <h2 className="text-2xl font-bold mb-1">¡Bienvenido de vuelta!</h2>
                        <p className="text-primary-100">{user?.fullName || 'Usuario'}</p>
                        <p className="text-sm text-primary-200 mt-1">
                            Rol: {user?.role === 'super_admin' ? 'Super Administrador' : 'Usuario de Negocio'}
                        </p>
                    </div>
                    {isAdmin && (
                        <select
                            value={businessId}
                            onChange={(e) => {
                                const id = e.target.value;
                                const name = id ? businesses?.find(b => b.id === id)?.name || '' : 'Seleccione negocio';
                                setSelectedBusiness(id, name);
                            }}
                            className="px-3 py-2 rounded-md text-sm text-gray-900 bg-white"
                        >
                            <option value="">Seleccione negocio</option>
                            {businesses?.map((b) => (
                                <option key={b.id} value={b.id}>{b.name}</option>
                            ))}
                        </select>
                    )}
                </div>
            </div>

            {/* Stats Grid — fila 1 */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <StatCard title="Pagos recibidos (mes)" value={formatMoney(stats.pagosDelMes)} icon="💵" color="blue" subtitle="cobros del mes actual" />
                <StatCard title="Cartera activa" value={formatMoney(stats.carteraActiva)} icon="📋" color="green" subtitle="saldo pendiente activos" />
                <StatCard title="Total prestado" value={formatMoney(stats.totalPrestado)} icon="📊" color="purple" subtitle="activos + mora (capital+interés)" />
                <StatCard title="Ganancia esperada" value={formatMoney(stats.gananciaEsperada)} icon="🌟" color="amber" subtitle="intereses por cobrar" />
            </div>

            {/* Stats Grid — fila 2 */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <StatCard title="Créditos activos" value={String(stats.activeCredits)} icon="✅" color="green" subtitle="en curso" onClick={() => navigate('/credits')} />
                <StatCard title="Cobros hoy" value={String(stats.pagosHoy)} icon="📅" color="orange" subtitle="cuotas vencen hoy" onClick={() => navigate('/credits?filter=dueToday')} />
                <StatCard title="En mora" value={String(stats.overdueCredits)} icon="⚠️" color="red" subtitle="créditos vencidos" onClick={() => navigate('/credits?filter=overdue')} />
            </div>

            {/* Calendario + Panel lateral */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Calendario ocupa 2/3 */}
                <div className="lg:col-span-2">
                    <ColombianCalendar credits={credits || []} />
                </div>

                {/* Panel lateral */}
                <div className="space-y-4">
                    {/* Quick Actions */}
                    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
                        <h3 className="text-sm font-semibold text-gray-900 mb-3">Acciones Rápidas</h3>
                        <div className="grid grid-cols-1 gap-3">
                            <QuickActionButton title="Nuevo Cliente" icon="➕" onClick={() => navigate('/clients')} />
                            <QuickActionButton title="Nuevo Crédito" icon="💳" onClick={() => navigate('/credits')} />
                            <QuickActionButton title="Registrar Pago" icon="💵" onClick={() => navigate('/credits')} />
                        </div>
                    </div>

                    {/* Resumen cartera */}
                    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
                        <h3 className="text-sm font-semibold text-gray-900 mb-3">Resumen de Cartera</h3>
                        <div className="space-y-3">
                            <div className="flex justify-between items-center py-2 border-b border-gray-100">
                                <span className="text-sm text-gray-600">Pagos del mes</span>
                                <span className="text-sm font-bold text-blue-600">{formatMoney(stats.pagosDelMes)}</span>
                            </div>
                            <div className="flex justify-between items-center py-2 border-b border-gray-100">
                                <span className="text-sm text-gray-600">Cartera activa</span>
                                <span className="text-sm font-bold text-green-600">{formatMoney(stats.carteraActiva)}</span>
                            </div>
                            <div className="flex justify-between items-center py-2 border-b border-gray-100">
                                <span className="text-sm text-gray-600">Total prestado</span>
                                <span className="text-sm font-bold text-purple-600">{formatMoney(stats.totalPrestado)}</span>
                            </div>
                            <div className="flex justify-between items-center py-2 border-b border-gray-100">
                                <span className="text-sm text-gray-600">Créditos activos</span>
                                <span className="text-sm font-bold text-gray-800">{stats.activeCredits}</span>
                            </div>
                            <div className="flex justify-between items-center py-2 border-b border-gray-100">
                                <span className="text-sm text-gray-600">Cobros hoy</span>
                                <span className={`text-sm font-bold ${stats.pagosHoy > 0 ? 'text-amber-600' : 'text-gray-400'}`}>{stats.pagosHoy}</span>
                            </div>
                            <div className="flex justify-between items-center py-2">
                                <span className="text-sm text-gray-600">En mora</span>
                                <span className={`text-sm font-bold ${stats.overdueCredits > 0 ? 'text-red-600' : 'text-gray-400'}`}>{stats.overdueCredits}</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

function StatCard({ title, value, icon, color, subtitle, onClick }: { title: string; value: string; icon: string; color: string; subtitle?: string; onClick?: () => void }) {
    const colors: Record<string, string> = {
        blue: 'from-blue-500 to-blue-600',
        green: 'from-emerald-500 to-emerald-600',
        purple: 'from-purple-500 to-purple-600',
        orange: 'from-orange-500 to-orange-600',
        red: 'from-red-500 to-red-600',
        amber: 'from-amber-500 to-amber-600',
    };

    return (
        <div
            onClick={onClick}
            className={`bg-gradient-to-br ${colors[color] || colors.blue} rounded-xl shadow p-5 text-white ${onClick ? 'cursor-pointer hover:opacity-90 transition-opacity' : ''
                }`}
        >
            <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium opacity-80 uppercase tracking-wide">{title}</p>
                    <p className="text-2xl font-bold mt-1 truncate">{value}</p>
                    {subtitle && <p className="text-xs opacity-70 mt-1">{subtitle}</p>}
                </div>
                <div className="text-3xl opacity-75 ml-2">{icon}</div>
            </div>
        </div>
    );
}

function QuickActionButton({ title, icon, onClick }: { title: string; icon: string; onClick: () => void }) {
    return (
        <button
            onClick={onClick}
            className="flex items-center gap-3 p-3 bg-white hover:bg-primary-50 rounded-lg transition border border-gray-200 hover:border-primary-200 text-left w-full"
        >
            <span className="text-2xl">{icon}</span>
            <span className="font-medium text-gray-900 text-sm">{title}</span>
        </button>
    );
}
