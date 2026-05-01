import type { CompilationRow } from './ArchiveTypes';

const SS_KEY = 'archives_last_compilation';

export function loadPersistedCompilation() {
  try {
    const raw = sessionStorage.getItem(SS_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as {
      courseId: string; startDate: string; endDate: string;
      data: CompilationRow[]; title: string;
    };
  } catch { return null; }
}

export function savePersistedCompilation(
  courseId: string, startDate: string, endDate: string,
  data: CompilationRow[], title: string,
) {
  try {
    sessionStorage.setItem(SS_KEY, JSON.stringify({ courseId, startDate, endDate, data, title }));
  } catch { /* quota — ignore */ }
}

export const statusBadgeClass = (status: string) =>
  status === 'present' ? 'bg-success text-white' : status === 'absent' ? 'bg-danger text-white' : 'bg-warning text-dark';
