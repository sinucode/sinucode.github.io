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
        if (msg === 'Network Error') {
            return { code: 'ERR_NETWORK', message: 'No se pudo conectar con el servidor. Revisa tu conexión a internet.' };
        }
        if (msg) {
            return { code: 'ERR_CLIENT', message: msg };
        }
    }
    return { code: 'ERR_UNKNOWN', message: 'Ocurrió un error inesperado. Por favor intenta de nuevo.' };
}
