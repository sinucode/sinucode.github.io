import { Request, Response } from 'express';
import { getAuditLogs, exportAuditLogsToExcel, getAvailableActions } from '../services/audit.service';

/**
 * Controlador de auditoría
 */
export class AuditController {
    /**
     * Obtener logs de auditoría con filtros
     */
    async getAuditLogs(req: Request, res: Response): Promise<void> {
        try {
            const {
                businessId,
                userId,
                action,
                startDate,
                endDate,
                page,
                limit,
            } = req.query;

            const filters = {
                businessId: businessId as string,
                userId: userId as string,
                action: action as string,
                startDate: startDate ? new Date(startDate as string) : undefined,
                endDate: endDate ? new Date(endDate as string) : undefined,
                page: page ? parseInt(page as string) : 1,
                limit: limit ? parseInt(limit as string) : 50,
            };

            const result = await getAuditLogs(filters);

            res.json({
                success: true,
                data: result.logs,
                pagination: result.pagination,
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                error: error instanceof Error ? error.message : 'Failed to fetch audit logs',
            });
        }
    }

    /**
     * Exportar logs a Excel
     */
    async exportLogs(req: Request, res: Response): Promise<void> {
        try {
            const {
                businessId,
                userId,
                action,
                startDate,
                endDate,
            } = req.query;

            const filters = {
                businessId: businessId as string,
                userId: userId as string,
                action: action as string,
                startDate: startDate ? new Date(startDate as string) : undefined,
                endDate: endDate ? new Date(endDate as string) : undefined,
            };

            const buffer = await exportAuditLogsToExcel(filters);

            // Configurar headers para descarga de archivo
            const filename = `audit_logs_${new Date().toISOString().split('T')[0]}.xlsx`;
            res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
            res.setHeader('Content-Disposition', `attachment; filename=${filename}`);
            res.send(buffer);
        } catch (error) {
            res.status(500).json({
                success: false,
                error: error instanceof Error ? error.message : 'Failed to export audit logs',
            });
        }
    }

    /**
     * Obtener acciones disponibles para filtros
     */
    async getActions(_req: Request, res: Response): Promise<void> {
        try {
            const actions = await getAvailableActions();

            res.json({
                success: true,
                data: actions,
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                error: error instanceof Error ? error.message : 'Failed to fetch actions',
            });
        }
    }


    /**
     * Eliminar un log de auditoría
     */
    async deleteLog(req: Request, res: Response): Promise<void> {
        try {
            const { id } = req.params;
            await import('../services/audit.service').then(s => s.deleteLog(id));

            res.json({
                success: true,
                message: 'Audit log deleted successfully',
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                error: error instanceof Error ? error.message : 'Failed to delete audit log',
            });
        }
    }
}

export const auditController = new AuditController();
