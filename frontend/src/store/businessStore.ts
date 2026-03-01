import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface BusinessState {
    selectedBusinessId: string;
    selectedBusinessName: string;
    setSelectedBusiness: (id: string, name: string) => void;
    clearSelectedBusiness: () => void;
}

export const useBusinessStore = create<BusinessState>()(
    persist(
        (set) => ({
            selectedBusinessId: '',
            selectedBusinessName: 'Todos los negocios',
            setSelectedBusiness: (id, name) => set({ selectedBusinessId: id, selectedBusinessName: name }),
            clearSelectedBusiness: () => set({ selectedBusinessId: '', selectedBusinessName: 'Todos los negocios' }),
        }),
        {
            name: 'business-store',
        }
    )
);
