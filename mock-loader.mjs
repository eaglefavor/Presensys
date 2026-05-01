
import fs from 'node:fs/promises';

const MOCKS = {
  'papaparse': 'export default { unparse: (data) => (data.length === 0 ? "" : data.map(row => Object.keys(row).join(",")).filter((v, i, a) => a.indexOf(v) === i).join("\\n") + "\\n" + data.map(row => Object.values(row).join(",")).join("\\n")) };',
  'xlsx': 'export const utils = { book_new: () => ({}), json_to_sheet: () => ({}), book_append_sheet: () => ({}) }; export const writeFile = () => {};',
  'jspdf': 'export default class jsPDF { constructor() { this.setFontSize = () => this; this.setFont = () => this; this.text = () => this; this.setTextColor = () => this; this.save = () => this; } };',
  'jspdf-autotable': 'export default () => {};',
  '@supabase/supabase-js': 'export const createClient = (url, key) => ({ url, key, auth: {}, from: () => ({ select: () => Promise.resolve({ data: [], error: null }) }) });',
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
