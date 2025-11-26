import api from '../lib/axios';

export interface Client {
    id: string;
    fullName: string;
    phone: string;
    cedula: string;
    nationality: string;
    address?: string;
    referredById?: string;
    businessId: string;
    createdAt: string;
    updatedAt: string;
    referredBy?: {
        id: string;
        fullName: string;
        phone: string;
    };
}

export interface CreateClientData {
    fullName: string;
    phone: string;
    cedula: string;
    nationality: string;
    address?: string;
    referredById?: string;
    businessId?: string; // Solo para admin/super_admin
}

export interface UpdateClientData {
    fullName?: string;
    phone?: string;
    cedula?: string;
    nationality?: string;
    address?: string;
    referredById?: string;
}

export const getClients = async (businessId?: string) => {
    const params = businessId ? { businessId } : {};
    const response = await api.get<Client[]>('/clients', { params });
    return response.data;
};

export const getClientById = async (id: string) => {
    const response = await api.get<Client>(`/clients/${id}`);
    return response.data;
};

export const createClient = async (data: CreateClientData) => {
    const response = await api.post<Client>('/clients', data);
    return response.data;
};

export const updateClient = async (id: string, data: UpdateClientData) => {
    const response = await api.put<Client>(`/clients/${id}`, data);
    return response.data;
};

export const deleteClient = async (id: string) => {
    const response = await api.delete<{ message: string }>(`/clients/${id}`);
    return response.data;
};

export const searchClients = async (query: string, businessId?: string) => {
    const params = { q: query, ...(businessId && { businessId }) };
    const response = await api.get<Client[]>('/clients/search', { params });
    return response.data;
};
