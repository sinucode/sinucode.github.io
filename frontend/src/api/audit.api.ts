import api from '../lib/axios';

export interface AuditLog {
    id: string;
    userId: string;
    action: string;
    description?: string;
    entityType?: string;
    entityId?: string;
    ipAddress?: string;
    createdAt: string;
    user?: {
        fullName: string;
        email: string;
    };
}

export interface AuditLogFilters {
    startDate?: Date;
    endDate?: Date;
    userId?: string;
    action?: string;
    page?: number;
    limit?: number;
}

export interface PaginatedAuditLogs {
    logs: AuditLog[];
    pagination: {
        page: number;
        limit: number;
        total: number;
        totalPages: number;
    };
}

/**
 * Obtener logs de auditoría con filtros
 */
export const getAuditLogs = async (filters: AuditLogFilters): Promise<PaginatedAuditLogs> => {
    const params = new URLSearchParams();

    if (filters.startDate) params.append('startDate', filters.startDate.toISOString());
    if (filters.endDate) params.append('endDate', filters.endDate.toISOString());
    if (filters.userId) params.append('userId', filters.userId);
    if (filters.action) params.append('action', filters.action);
    if (filters.page) params.append('page', filters.page.toString());
    if (filters.limit) params.append('limit', filters.limit.toString());

    const response = await api.get(`/audit?${params.toString()}`);
    return {
        logs: response.data.data,
        pagination: response.data.pagination,
    };
};

/**
 * Exportar logs de auditoría a Excel
 */
export const exportAuditLogs = async (filters: AuditLogFilters): Promise<Blob> => {
    const params = new URLSearchParams();

    if (filters.startDate) params.append('startDate', filters.startDate.toISOString());
    if (filters.endDate) params.append('endDate', filters.endDate.toISOString());
    if (filters.userId) params.append('userId', filters.userId);
    if (filters.action) params.append('action', filters.action);

    const response = await api.get(`/audit/export?${params.toString()}`, {
        responseType: 'blob',
    });

    return response.data;
};


/**
 * Eliminar log de auditoría
 */
export const deleteAuditLog = async (id: string): Promise<void> => {
    await api.delete(`/audit/${id}`);
};
