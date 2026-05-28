// Helpers de formato compartidos.

const PHASE_LABELS: Record<string, string> = {
  fase1: '1. Solicitud',
  hito1: '2. Aprobación interna',
  fase2: '3. Datos proveedor',
  fase3: '4. Validación docs',
  signed: '5. Firmado',
  rejected: 'Rechazado',
  cancelled: 'Cancelado',
};

export function phaseLabel(p: string | null | undefined): string {
  return p ? PHASE_LABELS[p] ?? p : '—';
}

export function phaseKind(p: string | null | undefined): 'green' | 'red' | 'gray' | 'blue' {
  if (p === 'signed') return 'green';
  if (p === 'rejected') return 'red';
  if (p === 'cancelled') return 'gray';
  return 'blue';
}

export function semKind(s: string | null | undefined): 'green' | 'yellow' | 'red' | 'gray' {
  if (s === 'green') return 'green';
  if (s === 'yellow') return 'yellow';
  if (s === 'red') return 'red';
  return 'gray';
}

export function statusKind(s: string | null | undefined): 'green' | 'red' | 'yellow' | 'gray' | 'blue' {
  if (s === 'aceptado' || s === 'signed' || s === 'active') return 'green';
  if (s === 'rechazado' || s === 'cancelled' || s === 'expired') return 'red';
  if (s === 'expiring' || s === 'pendiente_revision') return 'yellow';
  if (s === 'inactivo') return 'gray';
  return 'blue';
}

export function formatMoney(n: number | null | undefined, currency?: string | null): string {
  if (n == null) return '—';
  const fmt = new Intl.NumberFormat('es-CL').format(n);
  return currency ? `${fmt} ${currency}` : fmt;
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('es-CL', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  return iso.slice(0, 16).replace('T', ' · ');
}

export function formatDateShort(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  const months = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  return `${String(d.getDate()).padStart(2, '0')}/${months[d.getMonth()]}/${d.getFullYear()}`;
}

export function initials(name: string | null | undefined): string {
  if (!name) return '?';
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join('') || '?';
}
