import axiosInstance from '../lib/axios';

export async function fetchHolidays(years: number[]): Promise<string[]> {
    const res = await axiosInstance.get<{ dates: string[] }>('/holidays', {
        params: { years: years.join(',') },
    });
    return res.data.dates;
}
