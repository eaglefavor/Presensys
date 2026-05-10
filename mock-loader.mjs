
import fs from 'node:fs/promises';

const MOCKS = {
  'papaparse': 'export default { unparse: (data) => (data.length === 0 ? "" : data.map(row => Object.keys(row).join(",")).filter((v, i, a) => a.indexOf(v) === i).join("\\n") + "\\n" + data.map(row => Object.values(row).join(",")).join("\\n")) };',
  'xlsx': 'export const utils = { book_new: () => ({}), json_to_sheet: () => ({}), book_append_sheet: () => ({}) }; export const writeFile = () => {};',
  'jspdf': 'export default class jsPDF { constructor(options) { if (globalThis.__jsPDFMock?.constructor) globalThis.__jsPDFMock.constructor(options); this.setFontSize = (size) => { if (globalThis.__jsPDFMock?.setFontSize) globalThis.__jsPDFMock.setFontSize(size); return this; }; this.setFont = (font, style) => { if (globalThis.__jsPDFMock?.setFont) globalThis.__jsPDFMock.setFont(font, style); return this; }; this.text = (text, x, y) => { if (globalThis.__jsPDFMock?.text) globalThis.__jsPDFMock.text(text, x, y); return this; }; this.setTextColor = (c) => { if (globalThis.__jsPDFMock?.setTextColor) globalThis.__jsPDFMock.setTextColor(c); return this; }; this.save = (filename) => { if (globalThis.__jsPDFMock?.save) globalThis.__jsPDFMock.save(filename); return this; }; } };',
  'jspdf-autotable': 'export default function autoTable(doc, options) { if (globalThis.__autoTableMock) globalThis.__autoTableMock(doc, options); };',
};

export async function resolve(specifier, context, nextResolve) {
  if (MOCKS[specifier]) {
    return {
      shortCircuit: true,
      url: `mock:${specifier}`,
    };
  }
  if (specifier.startsWith('.') && !specifier.endsWith('.ts') && !specifier.endsWith('.js')) {
    const nextUrl = new URL(specifier + '.ts', context.parentURL).href;
    try {
      await fs.stat(new URL(nextUrl));
      return nextResolve(specifier + '.ts', context);
    } catch {
      // Ignore
    }
  }
  return nextResolve(specifier, context);
}

export async function load(url, context, nextLoad) {
  if (url.startsWith('mock:')) {
    const name = url.slice(5);
    return {
      format: 'module',
      shortCircuit: true,
      source: MOCKS[name],
    };
  }
  return nextLoad(url, context);
}
