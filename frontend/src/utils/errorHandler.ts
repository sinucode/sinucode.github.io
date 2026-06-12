export interface ApiError {
    code: string;
    message: string;
    details?: unknown;
}

export function getApiError(err: unknown): ApiError {
    if (err && typeof err === 'object') {
        const axiosErr = err as any;
        const data = axiosErr?.response?.data;
        if (data) {
            return {
                code: data.code || 'ERR_UNKNOWN',
                message: data.error || data.message || 'Error desconocido',
                details: data.details,
            };
        }
        const msg = axiosErr?.message;
        const axiosCode = axiosErr?.code;
        if (msg === 'Network Error') {
            return { code: 'ERR_NETWORK', message: 'No se pudo conectar con el servidor. Revisa tu conexión a internet.' };
        }
        if (axiosCode === 'ECONNABORTED' || (typeof msg === 'string' && msg.startsWith('timeout'))) {
            return {
                code: 'ERR_TIMEOUT',
                message: 'La operación tardó demasiado y se canceló. Si el saldo era suficiente, es posible que el crédito sí se haya creado — verifica el listado antes de reintentar.',
            };
        }
        if (axiosCode === 'ERR_CANCELED' || msg === 'canceled') {
            return {
                code: 'ERR_CANCELED',
                message: 'La operación fue cancelada. Puede que la sesión haya expirado — vuelve a iniciar sesión e intenta de nuevo.',
            };
        }
        if (msg) {
            return { code: 'ERR_CLIENT', message: msg };
        }
    }
    return { code: 'ERR_UNKNOWN', message: 'Ocurrió un error inesperado. Por favor intenta de nuevo.' };
}
