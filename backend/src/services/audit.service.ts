import prisma from '../config/database';
import logger from '../utils/logger';
import ExcelJS from 'exceljs';

export interface AuditLogParams {
    userId?: string;
    businessId?: string;
    action: string;
    description?: string;
    entityType?: string;
    entityId?: string;
    oldValues?: any;
    newValues?: any;
    ipAddress?: string;
    userAgent?: string;
}

/**
 * Registrar acción en el log de auditoría
 * OWASP: Security Logging (A09:2021)
 */
export const auditLog = async (params: AuditLogParams): Promise<void> => {
    try {
        await prisma.auditLog.create({
            data: {
                userId: params.userId,
                businessId: params.businessId,
                action: params.action,
                description: params.description,
                entityType: params.entityType,
                entityId: params.entityId,
                oldValues: params.oldValues || null,
                newValues: params.newValues || null,
                ipAddress: params.ipAddress,
                userAgent: params.userAgent,
            },
        });

        logger.debug('Audit log created', { action: params.action, userId: params.userId });
    } catch (error) {
        // No fallar la operación principal si falla el log de auditoría
        logger.error('Failed to create audit log', { error, params });
    }
};

interface AuditLogFilters {
    businessId?: string;
    userId?: string;
    action?: string;
    startDate?: Date;
    endDate?: Date;
    page?: number;
    limit?: number;
}

/**
 * Obtener logs de auditoría con paginación y filtros extendidos
 */
export const getAuditLogs = async (filters: AuditLogFilters) => {
    try {
        const {
            businessId,
            userId,
            action,
            startDate,
            endDate,
            page = 1,
            limit = 50,
        } = filters;

        const skip = (page - 1) * limit;

        const where: any = {};
        if (businessId) where.businessId = businessId;
        if (userId) where.userId = userId;
        if (action) where.action = action;

        // Filtro de fechas
        if (startDate || endDate) {
            where.createdAt = {};
            if (startDate) where.createdAt.gte = startDate;
            if (endDate) where.createdAt.lte = endDate;
        }

        const [logs, total] = await Promise.all([
            prisma.auditLog.findMany({
                where,
                include: {
                    user: {
                        select: {
                            fullName: true,
                            email: true,
                        },
                    },
                },
                orderBy: {
                    createdAt: 'desc',
                },
                skip,
                take: limit,
            }),
            prisma.auditLog.count({ where }),
        ]);

        return {
            logs,
            pagination: {
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit),
            },
        };
    } catch (error) {
        logger.error('Failed to get audit logs', { error });
        throw new Error('Failed to retrieve audit logs');
    }
};

/**
 * Exportar logs de auditoría a Excel
 */
export const exportAuditLogsToExcel = async (filters: AuditLogFilters): Promise<Buffer> => {
    try {
        // Obtener todos los logs sin paginación (máximo 10,000)
        const { logs } = await getAuditLogs({
            ...filters,
            limit: 10000,
        });

        // Crear workbook
        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet('Audit Logs');

        // Definir columnas
        worksheet.columns = [
            { header: 'Fecha/Hora', key: 'timestamp', width: 20 },
            { header: 'Usuario', key: 'userName', width: 25 },
            { header: 'Email', key: 'userEmail', width: 30 },
            { header: 'Acción', key: 'action', width: 25 },
            { header: 'Entidad', key: 'entityType', width: 15 },
            { header: 'ID Entidad', key: 'entityId', width: 40 },
            { header: 'IP', key: 'ipAddress', width: 15 },
        ];

        // Estilo del encabezado
        worksheet.getRow(1).font = { bold: true };
        worksheet.getRow(1).fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FF4F46E5' },
        };
        worksheet.getRow(1).font = { color: { argb: 'FFFFFFFF' }, bold: true };

        // Agregar datos
        logs.forEach((log: any) => {
            worksheet.addRow({
                timestamp: log.createdAt,
                userName: log.user?.fullName || 'N/A',
                userEmail: log.user?.email || 'N/A',
                action: log.action,
                entityType: log.entityType || 'N/A',
                entityId: log.entityId || 'N/A',
                ipAddress: log.ipAddress || 'N/A',
            });
        });

        // Aplicar filtros automáticos
        worksheet.autoFilter = {
            from: 'A1',
            to: 'G1',
        };

        // Generar buffer
        const buffer = await workbook.xlsx.writeBuffer();
        return Buffer.from(buffer);
    } catch (error) {
        logger.error('Failed to export audit logs to Excel', { error });
        throw new Error('Failed to export audit logs');
    }
};

/**
 * Obtener acciones únicas para filtros
 */
export const getAvailableActions = async (): Promise<string[]> => {
    try {
        const actions = await prisma.auditLog.findMany({
            distinct: ['action'],
            select: {
                action: true,
            },
        });

        return actions.map((a) => a.action).filter(Boolean);
    } catch (error) {
        logger.error('Failed to get available actions', { error });
        return [];
    }
};

/**
 * Eliminar un log de auditoría
 */
export const deleteLog = async (id: string): Promise<void> => {
    try {
        await prisma.auditLog.delete({
            where: { id },
        });
    } catch (error) {
        logger.error('Failed to delete audit log', { error, id });
        throw new Error('Failed to delete audit log');
    }
};

