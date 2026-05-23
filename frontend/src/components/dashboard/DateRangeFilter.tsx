import { useState } from 'react';
import { Calendar } from 'lucide-react';

export type DateRangePreset = 'today' | 'last7' | 'currentMonth' | 'last30' | 'currentYear' | 'custom';

export interface DateRange {
    startDate: string; // YYYY-MM-DD
    endDate: string;
    preset: DateRangePreset;
}

const todayBogotaStr = () =>
    new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(new Date());

const offsetDays = (days: number): string => {
    const d = new Date();
    d.setDate(d.getDate() + days);
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(d);
};

const firstOfMonth = (): string => {
    const today = todayBogotaStr();
    return `${today.slice(0, 7)}-01`;
};

const firstOfYear = (): string => {
    const today = todayBogotaStr();
    return `${today.slice(0, 4)}-01-01`;
};

export const presetToRange = (preset: DateRangePreset, custom?: { startDate: string; endDate: string }): DateRange => {
    const today = todayBogotaStr();
    switch (preset) {
        case 'today':
            return { startDate: today, endDate: today, preset };
        case 'last7':
            return { startDate: offsetDays(-6), endDate: today, preset };
        case 'currentMonth':
            return { startDate: firstOfMonth(), endDate: today, preset };
        case 'last30':
            return { startDate: offsetDays(-29), endDate: today, preset };
        case 'currentYear':
            return { startDate: firstOfYear(), endDate: today, preset };
        case 'custom':
            return {
                startDate: custom?.startDate || today,
                endDate: custom?.endDate || today,
                preset,
            };
    }
};

interface DateRangeFilterProps {
    value: DateRange;
    onChange: (range: DateRange) => void;
}

export default function DateRangeFilter({ value, onChange }: DateRangeFilterProps) {
    const [showCustom, setShowCustom] = useState(value.preset === 'custom');

    const presets: { value: DateRangePreset; label: string }[] = [
        { value: 'today', label: 'Hoy' },
        { value: 'last7', label: '7 días' },
        { value: 'currentMonth', label: 'Este mes' },
        { value: 'last30', label: '30 días' },
        { value: 'currentYear', label: 'Este año' },
        { value: 'custom', label: 'Personalizado' },
    ];

    const handlePresetClick = (preset: DateRangePreset) => {
        if (preset === 'custom') {
            setShowCustom(true);
            onChange(presetToRange('custom', { startDate: value.startDate, endDate: value.endDate }));
        } else {
            setShowCustom(false);
            onChange(presetToRange(preset));
        }
    };

    return (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
            <div className="flex items-center gap-2 mb-3">
                <Calendar size={16} className="text-gray-500" />
                <span className="text-sm font-semibold text-gray-700">Período</span>
                <span className="text-xs text-gray-400 ml-auto">
                    {value.startDate} → {value.endDate}
                </span>
            </div>
            <div className="flex flex-wrap gap-2">
                {presets.map((p) => (
                    <button
                        key={p.value}
                        type="button"
                        onClick={() => handlePresetClick(p.value)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                            value.preset === p.value
                                ? 'bg-primary-600 text-white shadow'
                                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                        }`}
                    >
                        {p.label}
                    </button>
                ))}
            </div>
            {showCustom && (
                <div className="mt-3 flex flex-wrap gap-3 items-end">
                    <div>
                        <label className="block text-xs text-gray-600 mb-1">Desde</label>
                        <input
                            type="date"
                            value={value.startDate}
                            onChange={(e) =>
                                onChange({ ...value, startDate: e.target.value, preset: 'custom' })
                            }
                            className="px-2 py-1 border border-gray-300 rounded text-sm"
                        />
                    </div>
                    <div>
                        <label className="block text-xs text-gray-600 mb-1">Hasta</label>
                        <input
                            type="date"
                            value={value.endDate}
                            onChange={(e) =>
                                onChange({ ...value, endDate: e.target.value, preset: 'custom' })
                            }
                            className="px-2 py-1 border border-gray-300 rounded text-sm"
                        />
                    </div>
                </div>
            )}
        </div>
    );
}
