import { QueryClient } from '@tanstack/react-query';

/**
 * Invalida todas las queries que se ven afectadas por un movimiento de dinero
 * (pago, transferencia, ingreso/retiro, diezmo, reversión, nuevo crédito, etc.).
 *
 * Los query keys del proyecto están fragmentados (p.ej. el calendario usa
 * 'credits-dashboard' y la lista usa 'credits'), y invalidateQueries solo hace
 * match por prefijo, así que hay que listarlos todos para que la UI se
 * actualice al instante sin tener que refrescar la página.
 */
const MONEY_KEYS = [
    'credit',
    'credits',
    'credits-dashboard',
    'dashboard-stats',
    'cash-dashboard',
    'cashFlow',
    'cashForecast',
    'cashMovements',
    'account-balances',
    'accounts',
    'payments',
    'tithe',
    'business',
    'businesses',
];

export function invalidateMoney(qc: QueryClient) {
    MONEY_KEYS.forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
}
