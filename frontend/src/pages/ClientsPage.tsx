import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Search, Edit2, Trash2, UserCheck, Copy } from 'lucide-react';
import { useAuthStore } from '../store/authStore';
import { getClients, deleteClient, Client } from '../api/clients.api';
import { getBusinesses } from '../api/business.api';
import ClientForm from '../components/clients/ClientForm';
import { CopyClientDialog } from '../components/clients/CopyClientDialog';
import ConfirmDialog from '../components/common/ConfirmDialog';

const ClientsPage = () => {
    const { user } = useAuthStore();
    const queryClient = useQueryClient();
    const [isFormOpen, setIsFormOpen] = useState(false);
    const [editingClient, setEditingClient] = useState<Client | undefined>(undefined);
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedBusinessId, setSelectedBusinessId] = useState<string>('');

    // Estado para el diálogo de confirmación
    const [clientToDelete, setClientToDelete] = useState<Client | null>(null);

    // Estado para el diálogo de copiar cliente
    const [clientToCopy, setClientToCopy] = useState<Client | null>(null);

    const isAdmin = ['admin', 'super_admin'].includes(user?.role || '');
    const isSuperAdmin = user?.role === 'super_admin';

    // Cargar negocios para el filtro (solo admin)
    const { data: businesses } = useQuery({
        queryKey: ['businesses'],
        queryFn: getBusinesses,
        enabled: isAdmin,
    });

    // Cargar clientes
    const { data: clients, isLoading } = useQuery({
        queryKey: ['clients', selectedBusinessId],
        queryFn: () => getClients(selectedBusinessId),
        enabled: !isAdmin || !!selectedBusinessId, // evitar error en admin sin negocio seleccionado
        // Si es admin, espera a que seleccione negocio o carga todos si la API lo soporta (ajustamos backend para requerir ID o no)
        // En este caso, el backend requiere businessId para admin, así que podríamos seleccionar el primero por defecto
    });

    // Efecto para seleccionar el primer negocio por defecto si es admin
    React.useEffect(() => {
        if (isAdmin && businesses && businesses.length > 0 && !selectedBusinessId) {
            setSelectedBusinessId(businesses[0].id);
        }
    }, [businesses, isAdmin, selectedBusinessId]);

    const deleteMutation = useMutation({
        mutationFn: deleteClient,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['clients'] });
            setClientToDelete(null);
        },
    });

    const handleEdit = (client: Client) => {
        setEditingClient(client);
        setIsFormOpen(true);
    };

    const handleDeleteClick = (client: Client) => {
        setClientToDelete(client);
    };

    const confirmDelete = () => {
        if (clientToDelete) {
            deleteMutation.mutate(clientToDelete.id);
        }
    };

    const filteredClients = clients?.filter(client =>
        client.fullName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        client.phone.includes(searchTerm) ||
        client.cedula.includes(searchTerm)
    );

    return (
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-gray-800">Clientes</h1>
                    <p className="text-gray-600">Gestión de clientes y referidos</p>
                </div>
                <button
                    onClick={() => {
                        setEditingClient(undefined);
                        setIsFormOpen(true);
                    }}
                    className="bg-primary-600 text-white px-4 py-2 rounded-md flex items-center gap-2 hover:bg-primary-700 transition-colors w-full md:w-auto justify-center"
                >
                    <Plus size={20} />
                    Nuevo Cliente
                </button>
            </div>

            {/* Filtros y Búsqueda */}
            <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200 flex flex-col md:flex-row gap-4">
                {isAdmin && (
                    <div className="w-full md:w-1/3">
                        <select
                            value={selectedBusinessId}
                            onChange={(e) => setSelectedBusinessId(e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
                        >
                            {businesses?.map((b) => (
                                <option key={b.id} value={b.id}>
                                    {b.name}
                                </option>
                            ))}
                        </select>
                    </div>
                )}
                <div className="relative flex-1">
                    <input
                        type="text"
                        placeholder="Buscar por nombre, celular o cédula..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
                    />
                    <Search className="absolute left-3 top-2.5 text-gray-400" size={20} />
                </div>
            </div>

            {/* Tabla de Clientes */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead className="bg-gray-50">
                            <tr>
                                <th className="px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Cliente</th>
                                <th className="px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Contacto</th>
                                <th className="px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider hidden md:table-cell">Documento</th>
                                <th className="px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider hidden lg:table-cell">Nacionalidad</th>
                                <th className="px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider hidden lg:table-cell">Recomendado Por</th>
                                {isAdmin && (
                                    <th className="px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider text-right">Acciones</th>
                                )}
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200">
                            {isLoading ? (
                                <tr>
                                    <td colSpan={6} className="px-6 py-8 text-center text-gray-500">
                                        Cargando clientes...
                                    </td>
                                </tr>
                            ) : filteredClients?.length === 0 ? (
                                <tr>
                                    <td colSpan={6} className="px-6 py-8 text-center text-gray-500">
                                        No se encontraron clientes
                                    </td>
                                </tr>
                            ) : (
                                filteredClients?.map((client) => (
                                    <tr key={client.id} className="hover:bg-gray-50 transition-colors">
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            <div className="font-medium text-gray-900">{client.fullName}</div>
                                            <div className="text-sm text-gray-500 md:hidden">{client.cedula}</div>
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            <div className="text-gray-900">{client.phone}</div>
                                            {client.address && (
                                                <div className="text-xs text-gray-500 truncate max-w-[150px]">{client.address}</div>
                                            )}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap hidden md:table-cell text-gray-500">
                                            {client.cedula}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap hidden lg:table-cell text-gray-500">
                                            {client.nationality}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap hidden lg:table-cell">
                                            {client.referredBy ? (
                                                <div className="flex items-center gap-2 text-primary-600 bg-primary-50 px-2 py-1 rounded-full w-fit text-xs font-medium">
                                                    <UserCheck size={14} />
                                                    {client.referredBy.fullName}
                                                </div>
                                            ) : (
                                                <span className="text-gray-400 text-xs">-</span>
                                            )}
                                        </td>
                                        {isAdmin && (
                                            <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                                <div className="flex items-center justify-end gap-2">
                                                    <button
                                                        onClick={() => handleEdit(client)}
                                                        className="text-blue-600 hover:text-blue-900 p-1 hover:bg-blue-50 rounded"
                                                        title="Editar"
                                                    >
                                                        <Edit2 size={18} />
                                                    </button>
                                                    {isSuperAdmin && (
                                                        <button
                                                            onClick={() => setClientToCopy(client)}
                                                            className="text-purple-600 hover:text-purple-900 p-1 hover:bg-purple-50 rounded"
                                                            title="Copiar a otro negocio"
                                                        >
                                                            <Copy size={18} />
                                                        </button>
                                                    )}
                                                    <button
                                                        onClick={() => handleDeleteClick(client)}
                                                        className="text-red-600 hover:text-red-900 p-1 hover:bg-red-50 rounded"
                                                        title="Eliminar"
                                                    >
                                                        <Trash2 size={18} />
                                                    </button>
                                                </div>
                                            </td>
                                        )}
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {isFormOpen && (
                <ClientForm
                    client={editingClient}
                    onClose={() => setIsFormOpen(false)}
                    onSuccess={() => setIsFormOpen(false)}
                    selectedBusinessId={selectedBusinessId}
                />
            )}

            {clientToCopy && (
                <CopyClientDialog
                    client={clientToCopy}
                    onClose={() => setClientToCopy(null)}
                    onSuccess={() => {
                        setClientToCopy(null);
                        queryClient.invalidateQueries({ queryKey: ['clients'] });
                    }}
                />
            )}

            <ConfirmDialog
                isOpen={!!clientToDelete}
                title="Eliminar Cliente"
                message={`¿Estás seguro de eliminar al cliente "${clientToDelete?.fullName}"? Esta acción no se puede deshacer.`}
                confirmText="Eliminar"
                cancelText="Cancelar"
                onConfirm={confirmDelete}
                onCancel={() => setClientToDelete(null)}
                isLoading={deleteMutation.isPending}
            />
        </div>
    );
};

export default ClientsPage;
