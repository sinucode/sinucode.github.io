import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useAuthStore } from '../store/authStore';
import { getCredits } from '../api/credits.api';
import { getBusinesses } from '../api/business.api';
import { getDashboardStats } from '../api/dashboard.api';
import { useBusinessStore } from '../store/businessStore';
import ColombianCalendar from '../components/dashboard/ColombianCalendar';
import DateRangeFilter, { DateRange, presetToRange } from '../components/dashboard/DateRangeFilter';
import TotalDebtCard from '../components/dashboard/TotalDebtCard';
import TopDeudores from '../components/dashboard/TopDeudores';
import TendenciaPagos from '../components/dashboard/TendenciaPagos';
import ProximosVencimientos from '../components/dashboard/ProximosVencimientos';
import DistribucionCartera from '../components/dashboard/DistribucionCartera';

const formatMoney = (val: any) => `$${Math.ceil(Number(val || 0)).toLocaleString('es-CO')}`;

export default function DashboardHome() {
    const { user } = useAuthStore();
    const navigate = useNavigate();
    const isAdmin = ['admin', 'super_admin'].includes(user?.role || '');
    const { selectedBusinessId: businessId, setSelectedBusiness } = useBusinessStore();

    const [dateRange, setDateRange] = useState<DateRange>(() => presetToRange('currentMonth'));

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

    // Para el calendario seguimos cargando todos los créditos del negocio
    const { data: credits } = useQuery({
        queryKey: ['credits-dashboard', businessId],
        queryFn: () => getCredits({ businessId }),
        enabled: isAdmin ? !!businessId : true,
    });

    // Nuevo endpoint consolidado para todos los KPIs y datos del dashboard
    const { data: stats, isLoading: statsLoading } = useQuery({
        queryKey: ['dashboard-stats', businessId, dateRange.startDate, dateRange.endDate],
        queryFn: () => getDashboardStats({
            businessId: businessId!,
            startDate: dateRange.startDate,
            endDate: dateRange.endDate,
        }),
        enabled: !!businessId,
    });

    const kpis = stats?.kpis;

    return (
        <div className="space-y-5">
            {/* Welcome Card */}
            <div className="bg-gradient-to-r from-primary-600 to-primary-800 rounded-lg shadow-lg p-5 text-white">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div>
                        <h2 className="text-xl sm:text-2xl font-bold mb-1">¡Bienvenido de vuelta!</h2>
                        <p className="text-primary-100 text-sm">{user?.fullName || 'Usuario'}</p>
                        <p className="text-xs text-primary-200 mt-1">
                            Rol: {user?.role === 'super_admin' ? 'Super Administrador' : user?.role === 'admin' ? 'Administrador' : 'Usuario de Negocio'}
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

            {/* Filtro de fechas */}
            <DateRangeFilter value={dateRange} onChange={setDateRange} />

            {/* Tarjeta destacada: cuánto deben los clientes */}
            <TotalDebtCard
                totalAdeudado={kpis?.totalAdeudado ?? 0}
                carteraAlDia={kpis?.carteraAlDia ?? 0}
                carteraVencida={kpis?.carteraVencida ?? 0}
            />

            {/* KPIs Fila 1 — Período (responde al filtro) */}
            <div>
                <p className="text-xs font-semibold text-gray-500 uppercase mb-2 px-1">
                    Movimientos del período seleccionado
                </p>
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                    <KpiCard
                        title="Pagos recibidos"
                        value={formatMoney(kpis?.pagosRecibidos ?? 0)}
                        color="blue"
                        loading={statsLoading}
                    />
                    <KpiCard
                        title="Donaciones recibidas"
                        value={formatMoney(kpis?.donacionesRecibidas ?? 0)}
                        color="emerald"
                        loading={statsLoading}
                    />
                    <KpiCard
                        title="Ganancia realizada"
                        value={formatMoney(kpis?.gananciaRealizada ?? 0)}
                        color="amber"
                        loading={statsLoading}
                    />
                    <KpiCard
                        title="Créditos nuevos"
                        value={String(kpis?.creditosNuevos ?? 0)}
                        color="purple"
                        loading={statsLoading}
                    />
                </div>
            </div>

            {/* KPIs Fila 2 — Estado actual (no filtra) */}
            <div>
                <p className="text-xs font-semibold text-gray-500 uppercase mb-2 px-1">
                    Estado actual (al día de hoy)
                </p>
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                    <KpiCard
                        title="Cartera vencida"
                        value={formatMoney(kpis?.carteraVencida ?? 0)}
                        color="red"
                        loading={statsLoading}
                        onClick={() => navigate('/credits?filter=overdue')}
                    />
                    <KpiCard
                        title="Créditos activos"
                        value={String(kpis?.creditosActivos ?? 0)}
                        color="green"
                        loading={statsLoading}
                        onClick={() => navigate('/credits')}
                    />
                    <KpiCard
                        title="Créditos en mora"
                        value={String(kpis?.creditosVencidos ?? 0)}
                        color="red"
                        loading={statsLoading}
                        onClick={() => navigate('/credits?filter=overdue')}
                    />
                    <KpiCard
                        title="Cobros hoy"
                        value={String(kpis?.cobrosHoy ?? 0)}
                        color="orange"
                        loading={statsLoading}
                        onClick={() => navigate('/credits?filter=dueToday')}
                    />
                </div>
            </div>

            {/* Calendario + Próximos vencimientos */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
                <div className="lg:col-span-2">
                    <ColombianCalendar credits={credits || []} />
                </div>
                <div>
                    <ProximosVencimientos vencimientos={stats?.proximosVencimientos ?? []} />
                </div>
            </div>

            {/* Tendencia + Distribución */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
                <div className="lg:col-span-2">
                    <TendenciaPagos data={stats?.tendenciaPagos ?? []} />
                </div>
                <div>
                    <DistribucionCartera
                        activos={stats?.distribucionCartera?.activos ?? 0}
                        vencidos={stats?.distribucionCartera?.vencidos ?? 0}
                        pagados={stats?.distribucionCartera?.pagados ?? 0}
                    />
                </div>
            </div>

            {/* Top Deudores */}
            <TopDeudores deudores={stats?.topDeudores ?? []} />

            {/* Quick Actions */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
                <h3 className="text-sm font-semibold text-gray-900 mb-3">Acciones rápidas</h3>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <QuickActionButton title="Nuevo Cliente" icon="➕" onClick={() => navigate('/clients')} />
                    <QuickActionButton title="Nuevo Crédito" icon="💳" onClick={() => navigate('/credits')} />
                    <QuickActionButton title="Registrar Pago" icon="💵" onClick={() => navigate('/credits')} />
                    <QuickActionButton title="Ver Flujo de Caja" icon="📊" onClick={() => navigate('/cash')} />
                </div>
            </div>
        </div>
    );
}

function KpiCard({
    title,
    value,
    color,
    loading,
    onClick,
}: {
    title: string;
    value: string;
    color: string;
    loading?: boolean;
    onClick?: () => void;
}) {
    const colors: Record<string, string> = {
        blue: 'from-blue-500 to-blue-600',
        green: 'from-emerald-500 to-emerald-600',
        emerald: 'from-emerald-500 to-teal-600',
        purple: 'from-purple-500 to-purple-600',
        orange: 'from-orange-500 to-orange-600',
        red: 'from-red-500 to-red-600',
        amber: 'from-amber-500 to-amber-600',
    };

    return (
        <div
            onClick={onClick}
            className={`bg-gradient-to-br ${colors[color] || colors.blue} rounded-xl shadow p-4 text-white ${
                onClick ? 'cursor-pointer hover:opacity-90 transition-opacity' : ''
            }`}
        >
            <p className="text-xs font-medium opacity-90 uppercase tracking-wide">{title}</p>
            {loading ? (
                <div className="mt-2 h-7 bg-white/20 rounded animate-pulse" />
            ) : (
                <p className="text-xl sm:text-2xl font-bold mt-1 truncate">{value}</p>
            )}
        </div>
    );
}

function QuickActionButton({ title, icon, onClick }: { title: string; icon: string; onClick: () => void }) {
    return (
        <button
            onClick={onClick}
            className="flex items-center gap-3 p-3 bg-gray-50 hover:bg-primary-50 rounded-lg transition border border-gray-200 hover:border-primary-200 text-left"
        >
            <span className="text-2xl">{icon}</span>
            <span className="font-medium text-gray-900 text-sm">{title}</span>
        </button>
    );
}
