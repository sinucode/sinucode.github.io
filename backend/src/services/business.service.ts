import prisma from '../config/database';

interface CreateBusinessData {
    name: string;
    description?: string;
    initialCapital?: number;
}

interface UpdateBusinessData {
    name?: string;
    description?: string;
    initialCapital?: number;
}

/**
     * Servicio de gestión de negocios
     */
export class BusinessService {
    /** Devuelve el businessId asignado a un usuario (admin/user) — primer registro en userBusiness */
    private async getUserBusiness(userId: string): Promise<string | null> {
        const ub = await prisma.userBusiness.findFirst({
            where: { userId },
            select: { businessId: true },
        });
        return ub?.businessId || null;
    }

    /**
     * Obtener todos los negocios
     * Implementa filtrado por rol para Defense-in-Depth
     *
     * @param userId - ID del usuario (opcional para backward compatibility)
     * @param userRole - Rol del usuario (opcional para backward compatibility)
     * @returns Lista de negocios accesibles para el usuario
     */
    async getAllBusinesses(userId?: string, userRole?: 'user' | 'admin' | 'super_admin') {
        // Si no se proporciona userId/role, asumir llamada de admin (backward compatibility)
        // O si es admin/super_admin, retornar todos los negocios
        if (!userId || !userRole || userRole === 'super_admin') {
            const businesses = await prisma.business.findMany({
                select: {
                    id: true,
                    name: true,
                    description: true,
                    initialCapital: true,
                    currentBalance: true,
                    createdById: true,
                    createdAt: true,
                    updatedAt: true,
                    createdBy: {
                        select: {
                            fullName: true,
                            email: true,
                        },
                    },
                },
                orderBy: {
                    createdAt: 'desc',
                },
            });

            return businesses.map(business => ({
                id: business.id,
                name: business.name,
                description: business.description,
                initialCapital: Number(business.initialCapital),
                currentBalance: Number(business.currentBalance),
                createdById: business.createdById,
                createdAt: business.createdAt,
                updatedAt: business.updatedAt,
                createdBy: business.createdBy,
            }));
        }

        // Usuario regular: solo retornar negocios a los que está asignado
        const userBusinesses = await prisma.userBusiness.findMany({
            where: { userId },
            include: {
                business: {
                    include: {
                        createdBy: {
                            select: {
                                fullName: true,
                                email: true,
                            },
                        },
                    },
                },
            },
        });

        return userBusinesses.map(ub => ({
            id: ub.business.id,
            name: ub.business.name,
            description: ub.business.description,
            initialCapital: Number(ub.business.initialCapital),
            currentBalance: Number(ub.business.currentBalance),
            createdById: ub.business.createdById,
            createdAt: ub.business.createdAt,
            updatedAt: ub.business.updatedAt,
            createdBy: ub.business.createdBy,
        }));
    }

    /**
     * Obtener negocio por ID
     * Si se pasa userId + role, verifica que el admin solo acceda a su negocio
     */
    async getBusinessById(businessId: string, userId?: string, role?: string) {
        // Admin solo puede leer su propio negocio
        if (role === 'admin' && userId) {
            const ownId = await this.getUserBusiness(userId);
            if (ownId && ownId !== businessId) {
                throw new Error('No tiene permisos para acceder a este negocio');
            }
        }
        const business = await prisma.business.findUnique({
            where: { id: businessId },
            select: {
                id: true,
                name: true,
                description: true,
                initialCapital: true,
                currentBalance: true,
                createdById: true,
                createdAt: true,
                updatedAt: true,
                createdBy: {
                    select: {
                        fullName: true,
                        email: true,
                    },
                },
            },
        });

        if (!business) {
            throw new Error('Business not found');
        }

        return {
            id: business.id,
            name: business.name,
            description: business.description,
            initialCapital: Number(business.initialCapital),
            currentBalance: Number(business.currentBalance),
            createdById: business.createdById,
            createdAt: business.createdAt,
            updatedAt: business.updatedAt,
            createdBy: business.createdBy,
        };
    }

    /**
     * Crear nuevo negocio
     */
    async createBusiness(
        data: CreateBusinessData,
        requestingUserId: string,
        ipAddress: string = ''
    ) {
        // Negocio + cuenta por defecto + movimiento de capital inicial deben ser ATÓMICOS.
        // Si el movimiento fallara fuera de transacción, quedaría un negocio con saldo pero sin
        // su 'initial_capital', forzando el offset de reconciliación de forma permanente.
        const business = await prisma.$transaction(async (tx) => {
            const biz = await tx.business.create({
                data: {
                    name: data.name,
                    description: data.description,
                    initialCapital: data.initialCapital || 0,
                    currentBalance: data.initialCapital || 0,
                    createdById: requestingUserId,
                },
                select: {
                    id: true,
                    name: true,
                    description: true,
                    initialCapital: true,
                    currentBalance: true,
                    createdById: true,
                    createdAt: true,
                    updatedAt: true,
                },
            });

            // Crear cuenta "Efectivo" por defecto del nuevo negocio
            const defaultAccount = await tx.paymentAccount.create({
                data: { businessId: biz.id, name: 'Efectivo', type: 'cash', isDefault: true, isDisbursementDefault: true, createdById: requestingUserId },
            });

            // Registrar el capital inicial como movimiento contable para que el desglose por
            // cuenta sea consistente desde el primer día (sin necesidad de backfill futuro)
            if (Number(biz.initialCapital) > 0) {
                await tx.cashMovement.create({
                    data: {
                        businessId:   biz.id,
                        type:         'initial_capital',
                        amount:       biz.initialCapital,
                        balanceAfter: biz.initialCapital,
                        description:  'Capital inicial',
                        paymentMethod: defaultAccount.name,
                        accountId:    defaultAccount.id,
                        createdById:  requestingUserId,
                        createdAt:    biz.createdAt,
                    },
                });
            }

            return biz;
        });

        // Auditar
        await prisma.auditLog.create({
            data: {
                userId: requestingUserId,
                action: 'CREATE_BUSINESS',
                description: `Created business '${business.name}' with initial capital $${Number(business.initialCapital).toLocaleString()}`,
                entityType: 'Business',
                entityId: business.id,
                newValues: {
                    name: business.name,
                    initialCapital: Number(business.initialCapital)
                },
                ipAddress,
            },
        });

        return {
            id: business.id,
            name: business.name,
            description: business.description,
            initialCapital: Number(business.initialCapital),
            currentBalance: Number(business.currentBalance),
            createdById: business.createdById,
            createdAt: business.createdAt,
            updatedAt: business.updatedAt,
        };
    }

    /**
     * Actualizar negocio 
     * NOTA: Solo se puede actualizar nombre y descripción
     * El capital inicial NO se puede modificar por integridad financiera
     */
    async updateBusiness(
        businessId: string,
        data: UpdateBusinessData,
        requestingUserId: string,
        ipAddress: string = '',
        role?: string
    ) {
        // Admin solo puede editar su propio negocio
        if (role === 'admin') {
            const ownId = await this.getUserBusiness(requestingUserId);
            if (ownId && ownId !== businessId) {
                throw new Error('No tiene permisos para editar este negocio');
            }
        }

        // Verificar que el negocio existe
        const existingBusiness = await prisma.business.findUnique({
            where: { id: businessId },
        });

        if (!existingBusiness) {
            throw new Error('Business not found');
        }

        // IMPORTANTE: No permitir modificar initialCapital por seguridad financiera
        const updateData: any = {
            ...(data.name && { name: data.name }),
            ...(data.description !== undefined && { description: data.description }),
            // initialCapital NO SE PUEDE MODIFICAR
        };

        const updatedBusiness = await prisma.business.update({
            where: { id: businessId },
            data: updateData,
            select: {
                id: true,
                name: true,
                description: true,
                initialCapital: true,
                currentBalance: true,
                createdById: true,
                createdAt: true,
                updatedAt: true,
            },
        });

        // Auditar
        await prisma.auditLog.create({
            data: {
                userId: requestingUserId,
                action: 'UPDATE_BUSINESS',
                description: `Updated business '${updatedBusiness.name}'`,
                entityType: 'Business',
                entityId: businessId,
                newValues: data as any,
                ipAddress,
            },
        });

        return {
            id: updatedBusiness.id,
            name: updatedBusiness.name,
            description: updatedBusiness.description,
            initialCapital: Number(updatedBusiness.initialCapital),
            currentBalance: Number(updatedBusiness.currentBalance),
            createdById: updatedBusiness.createdById,
            createdAt: updatedBusiness.createdAt,
            updatedAt: updatedBusiness.updatedAt,
        };
    }

    /**
     * Eliminar negocio
     */
    async deleteBusiness(
        businessId: string,
        requestingUserId: string,
        ipAddress: string = ''
    ) {
        // Verificar que el negocio existe
        const business = await prisma.business.findUnique({
            where: { id: businessId },
            select: {
                id: true,
                name: true,
            },
        });

        if (!business) {
            throw new Error('Business not found');
        }

        // Eliminar negocio (cascade eliminará relaciones)
        await prisma.business.delete({
            where: { id: businessId },
        });

        // Auditar
        await prisma.auditLog.create({
            data: {
                userId: requestingUserId,
                action: 'DELETE_BUSINESS',
                description: `Deleted business '${business.name}'`,
                entityType: 'Business',
                entityId: businessId,
                ipAddress,
            },
        });

        return {
            id: businessId,
            message: 'Business deleted successfully',
        };
    }
}

export const businessService = new BusinessService();
