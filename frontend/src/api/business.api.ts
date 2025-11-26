import api from '../lib/axios';

export interface Business {
    id: string;
    name: string;
    description?: string;
    initialCapital: number;
    currentBalance: number;
    createdById: string;
    createdAt: string;
    updatedAt: string;
    createdBy?: {
        fullName: string;
        email: string;
    };
}

export interface CreateBusinessData {
    name: string;
    description?: string;
    initialCapital?: number;
}

export interface UpdateBusinessData {
    name?: string;
    description?: string;
    initialCapital?: number;
}

/**
 * Obtener todos los negocios
 */
export const getBusinesses = async (): Promise<Business[]> => {
    const response = await api.get('/businesses');
    return response.data;
};

/**
 * Obtener negocio por ID
 */
export const getBusiness = async (id: string): Promise<Business> => {
    const response = await api.get(`/businesses/${id}`);
    return response.data;
};

/**
 * Crear nuevo negocio
 */
export const createBusiness = async (data: CreateBusinessData): Promise<Business> => {
    const response = await api.post('/businesses', data);
    return response.data;
};

/**
 * Actualizar negocio
 */
export const updateBusiness = async (
    id: string,
    data: UpdateBusinessData
): Promise<Business> => {
    const response = await api.put(`/businesses/${id}`, data);
    return response.data;
};

/**
 * Eliminar negocio
 */
export const deleteBusiness = async (id: string): Promise<{ id: string; message: string }> => {
    const response = await api.delete(`/businesses/${id}`);
    return response.data;
};
