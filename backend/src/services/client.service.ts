import prisma from '../config/database';
import { UserRole } from '@prisma/client';

interface CreateClientData {
    fullName: string;
    phone: string;
    cedula: string;
    nationality: string;
    address?: string;
    referredById?: string | null;
    businessId?: string; // Solo para admin/super_admin
}

interface UpdateClientData {
    fullName?: string;
    phone?: string;
    cedula?: string;
    nationality?: string;
    address?: string;
    referredById?: string | null;
}

/**
 * Servicio de gestión de clientes
 * Implementa lógica de permisos basada en roles
 */
export class ClientService {
    /**
     * Obtener el negocio asignado a un usuario
     */
    private async getUserBusiness(userId: string): Promise<string | null> {
        const userBusiness = await prisma.userBusiness.findFirst({
            where: { userId },
            select: { businessId: true },
        });
        return userBusiness?.businessId || null;
    }

    /**
     * Obtener todos los clientes
     * - user: solo clientes de su negocio asignado
     * - admin/super_admin: clientes del negocio solicitado
     */
    async getAllClients(userId: string, userRole: UserRole, businessId?: string) {
        let targetBusinessId: string;

        if (userRole === 'user') {
            // Usuario regular: si hay businessId lo usa, de lo contrario toma el asignado
            if (businessId) {
                targetBusinessId = businessId;
            } else {
                const userBusinessId = await this.getUserBusiness(userId);
                if (!userBusinessId) {
                    throw new Error('Usuario no tiene negocio asignado');
                }
                targetBusinessId = userBusinessId;
            }
        } else {
            // Admin/super_admin: usar el businessId proporcionado
            if (!businessId) {
                throw new Error('businessId es requerido para admin/super_admin');
            }
            targetBusinessId = businessId;
        }

        const clients = await prisma.client.findMany({
            where: { businessId: targetBusinessId },
            select: {
                id: true,
                fullName: true,
                phone: true,
                cedula: true,
                nationality: true,
                address: true,
                referredById: true,
                businessId: true,
                createdAt: true,
                updatedAt: true,
                referredBy: {
                    select: {
                        id: true,
                        fullName: true,
                        phone: true,
                    },
                },
            },
            orderBy: {
                createdAt: 'desc',
            },
        });

        return clients;
    }

    /**
     * Obtener cliente por ID
     */
    async getClientById(clientId: string, userId: string, userRole: UserRole) {
        const client = await prisma.client.findUnique({
            where: { id: clientId },
            select: {
                id: true,
                fullName: true,
                phone: true,
                cedula: true,
                nationality: true,
                address: true,
                referredById: true,
                businessId: true,
                createdAt: true,
                updatedAt: true,
                referredBy: {
                    select: {
                        id: true,
                        fullName: true,
                        phone: true,
                    },
                },
                referrals: {
                    select: {
                        id: true,
                        fullName: true,
                        phone: true,
                    },
                },
            },
        });

        if (!client) {
            throw new Error('Cliente no encontrado');
        }

        // Verificar permisos
        if (userRole === 'user') {
            const userBusinessId = await this.getUserBusiness(userId);
            if (client.businessId !== userBusinessId) {
                throw new Error('No tiene permisos para ver este cliente');
            }
        }

        return client;
    }

    /**
     * Crear nuevo cliente
     */
    async createClient(
        data: CreateClientData,
        requestingUserId: string,
        userRole: UserRole,
        ipAddress: string = ''
    ) {
        // Normalizar valores opcionales
        const referredById = data.referredById === null ? null : data.referredById || undefined;
        const businessIdInput = data.businessId || undefined;

        let targetBusinessId: string;

        if (userRole === 'user') {
            // Usuario regular: crear en SU negocio
            const userBusinessId = await this.getUserBusiness(requestingUserId);
            if (!userBusinessId) {
                throw new Error('Usuario no tiene negocio asignado');
            }
            targetBusinessId = userBusinessId;
        } else {
            // Admin/super_admin: requiere businessId
            if (!businessIdInput) {
                throw new Error('businessId es requerido para admin/super_admin');
            }
            targetBusinessId = businessIdInput;
        }

        // Verificar que el teléfono no esté duplicado
        const existingClient = await prisma.client.findFirst({
            where: { phone: data.phone, businessId: targetBusinessId },
        });

        if (existingClient) {
            throw new Error('Ya existe un cliente con ese número de celular');
        }

        // Si tiene referredById, verificar que sea del mismo negocio
        if (referredById) {
            const referredClient = await prisma.client.findUnique({
                where: { id: referredById },
                select: { businessId: true },
            });

            if (!referredClient) {
                throw new Error('El cliente que recomienda no existe');
            }

            if (referredClient.businessId !== targetBusinessId) {
                throw new Error('El cliente que recomienda debe ser del mismo negocio');
            }
        }

        // Crear cliente
        const client = await prisma.client.create({
            data: {
                fullName: data.fullName,
                phone: data.phone,
                cedula: data.cedula,
                nationality: data.nationality || 'Colombiana',
                address: data.address,
                referredById,
                businessId: targetBusinessId,
            },
            select: {
                id: true,
                fullName: true,
                phone: true,
                cedula: true,
                nationality: true,
                address: true,
                referredById: true,
                businessId: true,
                createdAt: true,
                updatedAt: true,
            },
        });

        // Auditar
        await prisma.auditLog.create({
            data: {
                userId: requestingUserId,
                businessId: targetBusinessId,
                action: 'CREATE_CLIENT',
                description: `Creó cliente '${client.fullName}' (${client.phone})`,
                entityType: 'Client',
                entityId: client.id,
                newValues: {
                    fullName: client.fullName,
                    phone: client.phone,
                    cedula: client.cedula,
                },
                ipAddress,
            },
        });

        return client;
    }

    /**
     * Actualizar cliente
     * Solo admin/super_admin
     */
    async updateClient(
        clientId: string,
        data: UpdateClientData,
        requestingUserId: string,
        userRole: UserRole,
        ipAddress: string = ''
    ) {
        // Verificar permisos
        if (userRole === 'user') {
            throw new Error('Solo admin y super_admin pueden editar clientes');
        }

        // Normalizar opcionales (permitir null para eliminar referido)
        const referredById = data.referredById === null ? null : data.referredById || undefined;

        // Verificar que el cliente existe
        const existingClient = await prisma.client.findUnique({
            where: { id: clientId },
        });

        if (!existingClient) {
            throw new Error('Cliente no encontrado');
        }

        // Si se cambia el teléfono, verificar que no esté duplicado
        if (data.phone && data.phone !== existingClient.phone) {
            const phoneInUse = await prisma.client.findFirst({
                where: {
                    phone: data.phone,
                    businessId: existingClient.businessId,
                    NOT: { id: clientId },
                },
            });

            if (phoneInUse) {
                throw new Error('Ya existe un cliente con ese número de celular');
            }
        }

        // Evitar autorreferencia
        if (referredById && referredById === clientId) {
            throw new Error('Un cliente no puede recomendarse a sí mismo');
        }

        // Si se cambia referredById, verificar que sea del mismo negocio
        if (referredById && referredById !== existingClient.referredById) {
            const referredClient = await prisma.client.findUnique({
                where: { id: referredById },
                select: { businessId: true },
            });

            if (!referredClient) {
                throw new Error('El cliente que recomienda no existe');
            }

            if (referredClient.businessId !== existingClient.businessId) {
                throw new Error('El cliente que recomienda debe ser del mismo negocio');
            }
        }

        const updateData: any = {
            ...(data.fullName && { fullName: data.fullName }),
            ...(data.phone && { phone: data.phone }),
            ...(data.cedula && { cedula: data.cedula }),
            ...(data.nationality && { nationality: data.nationality }),
            ...(data.address !== undefined && { address: data.address }),
            ...(data.referredById !== undefined && { referredById }),
        };

        const updatedClient = await prisma.client.update({
            where: { id: clientId },
            data: updateData,
            select: {
                id: true,
                fullName: true,
                phone: true,
                cedula: true,
                nationality: true,
                address: true,
                referredById: true,
                businessId: true,
                createdAt: true,
                updatedAt: true,
            },
        });

        // Auditar
        await prisma.auditLog.create({
            data: {
                userId: requestingUserId,
                businessId: existingClient.businessId,
                action: 'UPDATE_CLIENT',
                description: `Actualizó cliente '${updatedClient.fullName}'`,
                entityType: 'Client',
                entityId: clientId,
                oldValues: existingClient as any,
                newValues: data as any,
                ipAddress,
            },
        });

        return updatedClient;
    }

    /**
     * Eliminar cliente
     * Solo admin/super_admin
     * SetNull en referrals que apuntan a este cliente
     */
    async deleteClient(
        clientId: string,
        requestingUserId: string,
        userRole: UserRole,
        ipAddress: string = ''
    ) {
        // Verificar permisos
        if (userRole === 'user') {
            throw new Error('Solo admin y super_admin pueden eliminar clientes');
        }

        const client = await prisma.client.findUnique({
            where: { id: clientId },
            select: {
                id: true,
                fullName: true,
                phone: true,
                businessId: true,
            },
        });

        if (!client) {
            throw new Error('Cliente no encontrado');
        }

        // Eliminar (Prisma SetNull automáticamente en referrals)
        await prisma.client.delete({
            where: { id: clientId },
        });

        // Auditar
        await prisma.auditLog.create({
            data: {
                userId: requestingUserId,
                businessId: client.businessId,
                action: 'DELETE_CLIENT',
                description: `Eliminó cliente '${client.fullName}' (${client.phone})`,
                entityType: 'Client',
                entityId: clientId,
                oldValues: client as any,
                ipAddress,
            },
        });

        return { message: 'Cliente eliminado exitosamente' };
    }

    /**
     * Buscar clientes
     */
    async searchClients(
        userId: string,
        userRole: UserRole,
        query: string,
        businessId?: string
    ) {
        let targetBusinessId: string;

        if (userRole === 'user') {
            const userBusinessId = await this.getUserBusiness(userId);
            if (!userBusinessId) {
                throw new Error('Usuario no tiene negocio asignado');
            }
            targetBusinessId = userBusinessId;
        } else {
            if (!businessId) {
                throw new Error('businessId es requerido para admin/super_admin');
            }
            targetBusinessId = businessId;
        }

        const clients = await prisma.client.findMany({
            where: {
                businessId: targetBusinessId,
                OR: [
                    { fullName: { contains: query, mode: 'insensitive' } },
                    { phone: { contains: query } },
                    { cedula: { contains: query } },
                ],
            },
            select: {
                id: true,
                fullName: true,
                phone: true,
                cedula: true,
                nationality: true,
            },
            take: 10,
        });

        return clients;
    }

    /**
     * Copiar cliente a otro negocio
     * Solo super_admin puede realizar esta operación
     * Crea una copia del cliente en el negocio destino
     */
    async copyClientToBusiness(
        clientId: string,
        targetBusinessId: string,
        requestingUserId: string,
        userRole: UserRole,
        ipAddress: string = ''
    ) {
        // Validación de permisos: solo super_admin
        if (userRole !== 'super_admin') {
            throw new Error('Solo super administradores pueden copiar clientes entre negocios');
        }

        // Obtener cliente origen
        const sourceClient = await prisma.client.findUnique({
            where: { id: clientId },
            select: {
                id: true,
                fullName: true,
                phone: true,
                cedula: true,
                nationality: true,
                address: true,
                businessId: true,
                business: {
                    select: {
                        name: true,
                    },
                },
            },
        });

        if (!sourceClient) {
            throw new Error('Cliente no encontrado');
        }

        // Validar que el negocio destino existe
        const targetBusiness = await prisma.business.findUnique({
            where: { id: targetBusinessId },
            select: {
                id: true,
                name: true,
            },
        });

        if (!targetBusiness) {
            throw new Error('Negocio destino no encontrado');
        }

        // Validar que el negocio destino es diferente al origen
        if (sourceClient.businessId === targetBusinessId) {
            throw new Error('El cliente ya pertenece a este negocio');
        }

        // Validar que no exista un cliente con el mismo teléfono en el negocio destino
        const existingClient = await prisma.client.findFirst({
            where: {
                phone: sourceClient.phone,
                businessId: targetBusinessId,
            },
        });

        if (existingClient) {
            throw new Error(
                `Ya existe un cliente con el teléfono ${sourceClient.phone} en ${targetBusiness.name}`
            );
        }

        // Copiar cliente (transacción atómica)
        const newClient = await prisma.$transaction(async (tx) => {
            // Crear copia del cliente en el negocio destino
            const client = await tx.client.create({
                data: {
                    fullName: sourceClient.fullName,
                    phone: sourceClient.phone,
                    cedula: sourceClient.cedula,
                    nationality: sourceClient.nationality,
                    address: sourceClient.address,
                    businessId: targetBusinessId,
                    // NO copiamos referredById (relación específica del negocio original)
                },
                select: {
                    id: true,
                    fullName: true,
                    phone: true,
                    cedula: true,
                    nationality: true,
                    address: true,
                    businessId: true,
                    createdAt: true,
                },
            });

            // Auditar operación de copia
            await tx.auditLog.create({
                data: {
                    userId: requestingUserId,
                    businessId: targetBusinessId,
                    action: 'COPY_CLIENT',
                    description: `Copió cliente '${sourceClient.fullName}' desde '${sourceClient.business.name}' a '${targetBusiness.name}'`,
                    entityType: 'Client',
                    entityId: client.id,
                    oldValues: {
                        sourceClientId: sourceClient.id,
                        sourceBusinessId: sourceClient.businessId,
                        sourceBusinessName: sourceClient.business.name,
                    },
                    newValues: {
                        targetClientId: client.id,
                        targetBusinessId: targetBusinessId,
                        targetBusinessName: targetBusiness.name,
                        copiedData: {
                            fullName: client.fullName,
                            phone: client.phone,
                            cedula: client.cedula,
                        },
                    },
                    ipAddress,
                },
            });

            return client;
        });

        return newClient;
    }
}
