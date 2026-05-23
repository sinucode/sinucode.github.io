/**
 * Exporta un array de objetos a un archivo CSV descargable.
 * Usa UTF-8 BOM para que Excel reconozca acentos y caracteres especiales.
 */

export interface CsvColumn<T> {
    header: string;
    accessor: (row: T) => string | number | null | undefined;
}

export function exportToCsv<T>(filename: string, rows: T[], columns: CsvColumn<T>[]) {
    if (rows.length === 0) {
        alert('No hay datos para exportar');
        return;
    }

    // Escapar valores para CSV: si contiene "," o '"' o newline, encerrarlo en comillas
    const escapeCell = (val: string | number | null | undefined): string => {
        if (val === null || val === undefined) return '';
        const str = String(val);
        if (/[",\n\r]/.test(str)) {
            return `"${str.replace(/"/g, '""')}"`;
        }
        return str;
    };

    const headerLine = columns.map(c => escapeCell(c.header)).join(',');
    const dataLines = rows.map(row =>
        columns.map(c => escapeCell(c.accessor(row))).join(',')
    );

    const csvContent = [headerLine, ...dataLines].join('\r\n');
    // BOM para que Excel detecte UTF-8
    const blob = new Blob(['﻿' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}
