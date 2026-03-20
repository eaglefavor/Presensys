import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

export interface ExportRow {
  [key: string]: string | number;
}

export interface ExportMeta {
  faculty?: string;
  department?: string;
  level?: string;
}

/**
 * Export data as a CSV file download.
 */
export function exportToCSV(data: ExportRow[], filename: string, meta?: ExportMeta) {
  // Prepend metadata rows if available
  const metaLines: string[] = [];
  if (meta?.faculty) metaLines.push(`Faculty,${meta.faculty}`);
  if (meta?.department) metaLines.push(`Department,${meta.department}`);
  if (meta?.level) metaLines.push(`Level,${meta.level}`);

  let csv = Papa.unparse(data);
  if (metaLines.length > 0) {
    csv = metaLines.join('\n') + '\n\n' + csv;
  }
  downloadBlob(csv, `${filename}.csv`, 'text/csv;charset=utf-8;');
}

/**
 * Export data as an XLSX (Excel) file download.
 */
export function exportToXLSX(data: ExportRow[], filename: string, meta?: ExportMeta) {
  const ws = XLSX.utils.json_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Attendance');
  
  // Auto-size columns
  const maxWidths = Object.keys(data[0] || {}).map(key => {
    const maxLen = Math.max(
      key.length,
      ...data.map(row => String(row[key] || '').length)
    );
    return { wch: Math.min(maxLen + 2, 40) };
  });
  ws['!cols'] = maxWidths;

  // Add metadata as a second sheet if available
  if (meta && (meta.faculty || meta.department || meta.level)) {
    const metaData = [
      { Field: 'Faculty', Value: meta.faculty || '' },
      { Field: 'Department', Value: meta.department || '' },
      { Field: 'Level', Value: meta.level || '' },
      { Field: 'Generated', Value: new Date().toLocaleString() },
    ];
    const metaWs = XLSX.utils.json_to_sheet(metaData);
    XLSX.utils.book_append_sheet(wb, metaWs, 'Info');
  }

  XLSX.writeFile(wb, `${filename}.xlsx`);
}

/**
 * Export data as a formatted PDF file download.
 */
export function exportToPDF(data: ExportRow[], title: string, filename: string, meta?: ExportMeta) {
  const doc = new jsPDF({ orientation: 'landscape' });
  
  // Title
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text(title, 14, 15);
  
  // Subtitle with date + academic info
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(100);
  const metaParts = [
    `Generated: ${new Date().toLocaleString()}`,
    meta?.faculty ? `Faculty: ${meta.faculty}` : '',
    meta?.department ? `Dept: ${meta.department}` : '',
    meta?.level ? `Level: ${meta.level}` : '',
    'Presensys - UNIZIK',
  ].filter(Boolean);
  doc.text(metaParts.join(' | '), 14, 22);
  doc.setTextColor(0);

  if (data.length > 0) {
    const headers = Object.keys(data[0]);
    const rows = data.map(row => headers.map(h => String(row[h] ?? '')));

    autoTable(doc, {
      head: [headers],
      body: rows,
      startY: 28,
      styles: { fontSize: 8, cellPadding: 3, font: 'helvetica' },
      headStyles: { fillColor: [13, 110, 253], textColor: 255, fontStyle: 'bold', fontSize: 8 },
      alternateRowStyles: { fillColor: [248, 249, 250] },
      margin: { left: 14, right: 14 },
    });
  }

  doc.save(`${filename}.pdf`);
}

/**
 * Export data as formatted plain text.
 * Uses ONLY ASCII characters for maximum device compatibility.
 */
export function exportToText(data: ExportRow[], title: string, meta?: ExportMeta): string {
  if (data.length === 0) return `${title}\n\nNo records found.`;

  const headers = Object.keys(data[0]);
  const colWidths = headers.map(h =>
    Math.max(h.length, ...data.map(row => String(row[h] || '').length)) + 2
  );

  const divider = colWidths.map(w => '-'.repeat(w)).join('-+-');
  const headerLine = headers.map((h, i) => h.padEnd(colWidths[i])).join(' | ');
  const bodyLines = data.map(row =>
    headers.map((h, i) => String(row[h] ?? '').padEnd(colWidths[i])).join(' | ')
  );

  const metaLines: string[] = [];
  if (meta?.faculty) metaLines.push(`Faculty: ${meta.faculty}`);
  if (meta?.department) metaLines.push(`Department: ${meta.department}`);
  if (meta?.level) metaLines.push(`Level: ${meta.level}`);

  const text = [
    `--- ${title} ---`,
    `Generated: ${new Date().toLocaleString()}`,
    ...metaLines,
    '',
    headerLine,
    divider,
    ...bodyLines,
    divider,
    `Total Records: ${data.length}`,
    `Source: Presensys - UNIZIK Digital Attendance`
  ].join('\n');

  return text;
}

/**
 * Download plain text as a .txt file.
 */
export function downloadText(text: string, filename: string) {
  downloadBlob(text, `${filename}.txt`, 'text/plain;charset=utf-8;');
}

/**
 * Share data using the Web Share API (for mobile sharing to WhatsApp, Gmail, etc.)
 * Falls back to clipboard copy on unsupported browsers.
 */
export async function shareData(text: string, title: string): Promise<boolean> {
  if (navigator.share) {
    try {
      await navigator.share({ title, text });
      return true;
    } catch (e) {
      // User cancelled or API error — fall through to clipboard
      if ((e as Error).name === 'AbortError') return false;
    }
  }

  // Fallback: copy to clipboard
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/**
 * Share a file blob using Web Share API (for sharing PDF/XLSX as attachments).
 */
export async function shareFile(blob: Blob, filename: string, title: string): Promise<boolean> {
  if (navigator.canShare && navigator.canShare({ files: [new File([blob], filename)] })) {
    try {
      await navigator.share({
        title,
        files: [new File([blob], filename, { type: blob.type })],
      });
      return true;
    } catch {
      return false;
    }
  }
  return false;
}

// Internal helper
function downloadBlob(content: string | ArrayBuffer, filename: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
