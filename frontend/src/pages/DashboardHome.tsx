import { useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useAuthStore } from '../store/authStore';
import { getCredits } from '../api/credits.api';
import { getCashFlow } from '../api/cash.api';
import { getBusinesses } from '../api/business.api';
import { useBusinessStore } from '../store/businessStore';
import ColombianCalendar from '../components/dashboard/ColombianCalendar';

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
        queryKey: ['credits-dashboard'],
        queryFn: () => getCredits(),
    });

    const { data: cashFlow } = useQuery({
        queryKey: ['cash-dashboard', businessId],
        queryFn: () => getCashFlow({ businessId }),
        enabled: !!businessId,
    });

    const stats = useMemo(() => {
        const activeCredits = credits?.filter((c: any) => c.status === 'active').length || 0;
        const saldoPendiente = credits?.reduce((acc: number, c: any) => acc + Number(c.remainingBalance || 0), 0) || 0;
        const pagosHoy = credits?.reduce((acc: number, c: any) => {
            if (!c.paymentSchedule) return acc;
            const today = new Date(); today.setHours(0, 0, 0, 0);
            const count = c.paymentSchedule.filter((p: any) => {
                const d = new Date(p.dueDate); d.setHours(0, 0, 0, 0);
                return d.getTime() === today.getTime() && p.status !== 'paid';
            }).length;
            return acc + count;
        }, 0) || 0;
        const totalIncome = cashFlow?.summary?.totalIncome || 0;
        const totalExpenses = cashFlow?.summary?.totalExpenses || 0;
        return { activeCredits, saldoPendiente, pagosHoy, totalIncome, totalExpenses };
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

            {/* Stats Grid */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                <StatCard title="Ingresos (flujo)" value={formatMoney(stats.totalIncome)} icon="💰" color="blue" />
                <StatCard title="Egresos (flujo)" value={formatMoney(stats.totalExpenses)} icon="💸" color="orange" />
                <StatCard title="Créditos activos" value={String(stats.activeCredits)} icon="📋" color="green" />
                <StatCard title="Pagos hoy" value={String(stats.pagosHoy)} icon="📅" color="purple" />
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
                                <span className="text-sm text-gray-600">Saldo pendiente</span>
                                <span className="text-sm font-bold text-primary-700">{formatMoney(stats.saldoPendiente)}</span>
                            </div>
                            <div className="flex justify-between items-center py-2 border-b border-gray-100">
                                <span className="text-sm text-gray-600">Créditos activos</span>
                                <span className="text-sm font-bold text-green-600">{stats.activeCredits}</span>
                            </div>
                            <div className="flex justify-between items-center py-2">
                                <span className="text-sm text-gray-600">Pagos hoy</span>
                                <span className={`text-sm font-bold ${stats.pagosHoy > 0 ? 'text-amber-600' : 'text-gray-400'}`}>
                                    {stats.pagosHoy}
                                </span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

function StatCard({ title, value, icon, color }: { title: string; value: string; icon: string; color: string }) {
    const colors: Record<string, string> = {
        blue: 'from-blue-500 to-blue-600',
        green: 'from-green-500 to-green-600',
        purple: 'from-purple-500 to-purple-600',
        orange: 'from-orange-500 to-orange-600',
    };

    return (
        <div className={`bg-gradient-to-br ${colors[color]} rounded-lg shadow p-6 text-white`}>
            <div className="flex items-center justify-between">
                <div>
                    <p className="text-sm opacity-90">{title}</p>
                    <p className="text-3xl font-bold mt-2">{value}</p>
                </div>
                <div className="text-4xl opacity-75">{icon}</div>
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
