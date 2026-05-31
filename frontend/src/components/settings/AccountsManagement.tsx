import { useEffect, useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Wallet, Building2, Smartphone, Plus, Pencil, Trash2, X, Star } from 'lucide-react';
import { getBusinesses } from '../../api/business.api';
import { getAccountBalances, createAccount, updateAccount, deleteAccount, AccountBalance } from '../../api/accounts.api';
import { invalidateMoney } from '../../utils/invalidate';

const formatMoney = (v: any) => `$${Math.ceil(Number(v || 0)).toLocaleString('es-CO')}`;

const typeMeta: Record<string, { label: string; icon: any }> = {
    cash: { label: 'Efectivo', icon: Wallet },
    bank: { label: 'Banco', icon: Building2 },
    wallet: { label: 'Billetera', icon: Smartphone },
};

export default function AccountsManagement() {
    const queryClient = useQueryClient();
    const [businessId, setBusinessId] = useState('');
    const [newName, setNewName] = useState('');
    const [newType, setNewType] = useState('bank');
    const [editing, setEditing] = useState<{ id: string; name: string } | null>(null);
    const [deleting, setDeleting] = useState<AccountBalance | null>(null);
    const [error, setError] = useState('');

    const { data: businesses } = useQuery({ queryKey: ['businesses'], queryFn: getBusinesses });

    useEffect(() => {
        if (!businessId && businesses && businesses.length > 0) setBusinessId(businesses[0].id);
    }, [businesses, businessId]);

    const { data: balData, isLoading } = useQuery({
        queryKey: ['account-balances', businessId],
        queryFn: () => getAccountBalances(businessId),
        enabled: !!businessId,
    });
    const accounts = balData?.accounts || [];

    const invalidate = () => invalidateMoney(queryClient);

    const createMut = useMutation({
        mutationFn: () => createAccount({ businessId, name: newName, type: newType }),
        onSuccess: () => { setNewName(''); setError(''); invalidate(); },
        onError: (e: any) => setError(e?.response?.data?.error || 'Error al crear cuenta'),
    });
    const updateMut = useMutation({
        mutationFn: (p: { id: string; name: string }) => updateAccount(p.id, { name: p.name }),
        onSuccess: () => { setEditing(null); invalidate(); },
        onError: (e: any) => setError(e?.response?.data?.error || 'Error al editar'),
    });
    const deleteMut = useMutation({
        mutationFn: (p: { id: string; mode?: 'transfer' | 'withdraw'; targetAccountId?: string }) => deleteAccount(p.id, { mode: p.mode, targetAccountId: p.targetAccountId }),
        onSuccess: () => { setDeleting(null); setError(''); invalidate(); },
        onError: (e: any) => setError(e?.response?.data?.error || 'Error al eliminar'),
    });

    const total = useMemo(() => accounts.reduce((s, a) => s + a.balance, 0), [accounts]);

    return (
        <div className="bg-white rounded-lg shadow p-6 space-y-6">
            <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                <div>
                    <h3 className="text-lg font-semibold">Cuentas / Métodos de pago</h3>
                    <p className="text-sm text-gray-500">Administra las cuentas del negocio y su saldo actual.</p>
                </div>
                {businesses && businesses.length > 1 && (
                    <select value={businessId} onChange={(e) => setBusinessId(e.target.value)} className="px-3 py-2 border border-gray-300 rounded-md text-sm">
                        {businesses.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                    </select>
                )}
            </div>

            {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-3 py-2">{error}</div>}

            {/* Crear cuenta */}
            <div className="flex flex-col sm:flex-row gap-2">
                <input
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder="Nombre (ej: Bancolombia, Nequi)"
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-md text-sm"
                />
                <select value={newType} onChange={(e) => setNewType(e.target.value)} className="px-3 py-2 border border-gray-300 rounded-md text-sm">
                    <option value="bank">Banco</option>
                    <option value="wallet">Billetera</option>
                    <option value="cash">Efectivo</option>
                </select>
                <button
                    onClick={() => newName.trim() && createMut.mutate()}
                    disabled={!newName.trim() || createMut.isPending}
                    className="flex items-center justify-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-md text-sm font-medium hover:bg-primary-700 disabled:opacity-50"
                >
                    <Plus size={16} /> Agregar
                </button>
            </div>

            {/* Lista de cuentas */}
            <div className="border border-gray-200 rounded-lg divide-y">
                {isLoading ? (
                    <div className="p-6 text-center text-gray-500 text-sm">Cargando...</div>
                ) : accounts.length === 0 ? (
                    <div className="p-6 text-center text-gray-500 text-sm">Sin cuentas</div>
                ) : accounts.map((a) => {
                    const meta = typeMeta[a.type] || typeMeta.bank;
                    const Icon = meta.icon;
                    return (
                        <div key={a.id} className="flex items-center gap-3 p-3">
                            <div className="p-2 rounded-lg bg-gray-100 text-gray-600"><Icon size={18} /></div>
                            <div className="flex-1 min-w-0">
                                {editing?.id === a.id ? (
                                    <div className="flex gap-2">
                                        <input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} className="flex-1 px-2 py-1 border border-gray-300 rounded text-sm" />
                                        <button onClick={() => updateMut.mutate({ id: a.id, name: editing.name })} className="px-2 py-1 bg-primary-600 text-white rounded text-xs">Guardar</button>
                                        <button onClick={() => setEditing(null)} className="px-2 py-1 bg-gray-100 rounded text-xs">Cancelar</button>
                                    </div>
                                ) : (
                                    <div className="flex items-center gap-2">
                                        <span className="font-medium text-gray-900">{a.name}</span>
                                        {a.isDefault && <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded"><Star size={10} /> Por defecto</span>}
                                        <span className="text-[10px] text-gray-400 uppercase">{meta.label}</span>
                                    </div>
                                )}
                            </div>
                            <div className="text-right">
                                <div className={`font-bold ${a.balance < 0 ? 'text-rose-600' : 'text-gray-900'}`}>{formatMoney(a.balance)}</div>
                            </div>
                            {editing?.id !== a.id && (
                                <div className="flex items-center gap-1">
                                    <button onClick={() => setEditing({ id: a.id, name: a.name })} className="p-1.5 text-gray-400 hover:text-primary-600 hover:bg-primary-50 rounded" title="Editar"><Pencil size={15} /></button>
                                    {!a.isDefault && (
                                        <button onClick={() => setDeleting(a)} className="p-1.5 text-gray-400 hover:text-rose-600 hover:bg-rose-50 rounded" title="Eliminar"><Trash2 size={15} /></button>
                                    )}
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
            <div className="flex justify-between text-sm font-semibold text-gray-700 px-1">
                <span>Total del negocio</span><span>{formatMoney(total)}</span>
            </div>

            {/* Modal eliminar con saldo */}
            {deleting && (
                <DeleteAccountModal
                    account={deleting}
                    accounts={accounts}
                    pending={deleteMut.isPending}
                    error={error}
                    onCancel={() => { setDeleting(null); setError(''); }}
                    onConfirm={(mode, targetAccountId) => { setError(''); deleteMut.mutate({ id: deleting.id, mode, targetAccountId }); }}
                />
            )}
        </div>
    );
}

function DeleteAccountModal({ account, accounts, pending, error, onCancel, onConfirm }: {
    account: AccountBalance; accounts: AccountBalance[]; pending: boolean; error?: string;
    onCancel: () => void; onConfirm: (mode?: 'transfer' | 'withdraw', target?: string) => void;
}) {
    const hasBalance = Math.abs(account.balance) > 0.01;
    const others = accounts.filter(a => a.id !== account.id);
    const [mode, setMode] = useState<'transfer' | 'withdraw'>('transfer');
    const [target, setTarget] = useState(others[0]?.id || '');

    return (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 p-4">
            <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-5">
                <div className="flex justify-between items-center mb-3">
                    <h3 className="text-lg font-bold text-rose-700">Eliminar cuenta</h3>
                    <button onClick={onCancel}><X size={18} className="text-gray-400" /></button>
                </div>
                <p className="text-sm text-gray-700 mb-3">Vas a eliminar <b>{account.name}</b>.</p>

                {hasBalance ? (
                    <>
                        <p className="text-sm bg-amber-50 border border-amber-200 text-amber-800 rounded p-2 mb-3">
                            Esta cuenta tiene un saldo de <b>{`$${Math.ceil(account.balance).toLocaleString('es-CO')}`}</b>. ¿Qué hacer con ese dinero?
                        </p>
                        <div className="space-y-2 mb-4">
                            <label className="flex items-center gap-2 p-2 border rounded-lg cursor-pointer">
                                <input type="radio" checked={mode === 'transfer'} onChange={() => setMode('transfer')} />
                                <span className="text-sm font-medium">Transferir a otra cuenta</span>
                            </label>
                            {mode === 'transfer' && (
                                <select value={target} onChange={(e) => setTarget(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm">
                                    {others.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                                </select>
                            )}
                            <label className="flex items-center gap-2 p-2 border rounded-lg cursor-pointer">
                                <input type="radio" checked={mode === 'withdraw'} onChange={() => setMode('withdraw')} />
                                <span className="text-sm font-medium">Retirar del negocio (sale de caja)</span>
                            </label>
                        </div>
                    </>
                ) : (
                    <p className="text-sm text-gray-500 mb-4">La cuenta no tiene saldo, se eliminará directamente.</p>
                )}

                {error && <p className="text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded p-2 mb-3">{error}</p>}

                <div className="flex gap-2">
                    <button onClick={onCancel} className="flex-1 px-4 py-2 bg-gray-100 rounded-md text-sm font-medium">Cancelar</button>
                    <button
                        onClick={() => onConfirm(hasBalance ? mode : undefined, hasBalance && mode === 'transfer' ? target : undefined)}
                        disabled={pending || (hasBalance && mode === 'transfer' && !target)}
                        className="flex-1 px-4 py-2 bg-rose-600 text-white rounded-md text-sm font-medium hover:bg-rose-700 disabled:opacity-50"
                    >
                        {pending ? 'Eliminando...' : 'Confirmar'}
                    </button>
                </div>
            </div>
        </div>
    );
}
