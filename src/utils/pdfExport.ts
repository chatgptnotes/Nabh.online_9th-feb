import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { StructuredExtraction } from '../services/documentExtractor';

export function exportToPdf(data: StructuredExtraction, fileName: string) {
  const doc = new jsPDF();
  let y = 15;

  // Title
  if (data.title) {
    doc.setFontSize(16);
    doc.setTextColor(21, 101, 192); // #1565C0
    doc.text(data.title, 14, y);
    y += 10;
  }

  // Document type
  if (data.documentType) {
    doc.setFontSize(10);
    doc.setTextColor(100, 100, 100);
    doc.text(`Type: ${data.documentType}`, 14, y);
    y += 8;
  }

  // Key-Value Pairs
  if (data.keyValuePairs.length > 0) {
    doc.setFontSize(12);
    doc.setTextColor(21, 101, 192);
    doc.text('Document Fields', 14, y);
    y += 2;

    autoTable(doc, {
      startY: y,
      head: [['Field', 'Value']],
      body: data.keyValuePairs.map(kv => [kv.key, kv.value]),
      headStyles: { fillColor: [21, 101, 192], fontStyle: 'bold', fontSize: 10 },
      bodyStyles: { fontSize: 9 },
      alternateRowStyles: { fillColor: [245, 245, 245] },
      margin: { left: 14, right: 14 },
    });
    y = (doc as any).lastAutoTable.finalY + 8;
  }

  // Sections
  if (data.sections.length > 0) {
    data.sections.forEach(section => {
      if (y > 260) { doc.addPage(); y = 15; }
      doc.setFontSize(11);
      doc.setTextColor(21, 101, 192);
      doc.text(section.heading, 14, y);
      y += 5;
      doc.setFontSize(9);
      doc.setTextColor(50, 50, 50);
      const lines = doc.splitTextToSize(section.content, 180);
      doc.text(lines, 14, y);
      y += lines.length * 4.5 + 6;
    });
  }

  // Tables
  data.tables.forEach(table => {
    if (y > 240) { doc.addPage(); y = 15; }

    if (table.caption) {
      doc.setFontSize(11);
      doc.setTextColor(21, 101, 192);
      doc.text(table.caption, 14, y);
      y += 2;
    }

    autoTable(doc, {
      startY: y,
      head: [table.headers],
      body: table.rows.map(row => row.map(cell => String(cell))),
      headStyles: { fillColor: [21, 101, 192], fontStyle: 'bold', fontSize: 9 },
      bodyStyles: { fontSize: 8 },
      alternateRowStyles: { fillColor: [245, 245, 245] },
      margin: { left: 14, right: 14 },
    });
    y = (doc as any).lastAutoTable.finalY + 8;
  });

  // Raw text fallback
  if (data.rawText && data.keyValuePairs.length === 0 && data.sections.length === 0 && data.tables.length === 0) {
    doc.setFontSize(9);
    doc.setTextColor(50, 50, 50);
    const lines = doc.splitTextToSize(data.rawText, 180);
    doc.text(lines, 14, y);
  }

  const cleanName = fileName.replace(/\.[^.]+$/, '').replace(/[^a-zA-Z0-9\s\-_]/g, '').substring(0, 50);
  doc.save(`${cleanName}_extracted.pdf`);
}
