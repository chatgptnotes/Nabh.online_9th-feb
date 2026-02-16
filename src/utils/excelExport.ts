import * as XLSX from 'xlsx';
import type { StructuredExtraction } from '../services/documentExtractor';

export function exportToExcel(data: StructuredExtraction, fileName: string) {
  const wb = XLSX.utils.book_new();
  const rows: (string | number)[][] = [];

  // Row 1: Document Title
  if (data.title) {
    rows.push([data.title]);
    rows.push([]); // empty separator
  }

  // Tables
  data.tables.forEach(table => {
    if (table.caption) {
      rows.push([table.caption]);
    }
    rows.push(table.headers);
    table.rows.forEach(row => rows.push(row));
    rows.push([]); // empty separator
  });

  // Sections
  if (data.sections.length > 0) {
    data.sections.forEach(s => {
      rows.push([s.heading]);
      rows.push([s.content]);
      rows.push([]);
    });
  }

  // Raw text fallback
  if (rows.length === 0 && data.rawText) {
    rows.push([data.rawText]);
  }

  const ws = XLSX.utils.aoa_to_sheet(rows);

  // Find max columns used
  const maxCols = Math.max(...rows.map(r => r.length), 2);
  ws['!cols'] = Array.from({ length: maxCols }, () => ({ wch: 25 }));

  XLSX.utils.book_append_sheet(wb, ws, 'Extracted Data');

  const cleanName = fileName.replace(/\.[^.]+$/, '').replace(/[^a-zA-Z0-9\s\-_]/g, '').substring(0, 50);
  XLSX.writeFile(wb, `${cleanName}_extracted.xlsx`);
}
