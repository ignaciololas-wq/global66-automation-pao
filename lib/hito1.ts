// Hito 1 — Semáforo automático post Fase 1.
// Verde: todos los equipos requeridos aprueban + sin sanciones + poderes ok + sin riesgo alto.
// Amarillo: pendiente / riesgo medio. Rojo: bloqueado.

type Decision = 'approved' | 'rejected' | 'requested_changes' | undefined;

interface SemaphoreArgs {
  approvals?: Record<string, Decision>;
  sanctions?: { hit?: boolean; matches?: unknown } | null;
  representatives?: { recomendacion?: string } | null;
  extraction?: { riesgos_detectados?: { severidad: string }[] } | null;
  requiredTeams?: string[];
}

export interface SemaphoreResult {
  color: 'red' | 'yellow' | 'green';
  reason: string;
  detail?: unknown;
}

export function computeSemaphore({ approvals, sanctions, representatives, extraction, requiredTeams }: SemaphoreArgs): SemaphoreResult {
  const reasons: string[] = [];
  const teams = (requiredTeams && requiredTeams.length) ? requiredTeams : ['compliance', 'legal', 'admin'];
  const need = teams.length;

  if (sanctions?.hit) {
    return { color: 'red', reason: 'Match en lista de sanciones', detail: sanctions.matches };
  }
  if (representatives?.recomendacion === 'rechazar') {
    return { color: 'red', reason: 'Apoderados rechazados', detail: representatives };
  }

  const okCount = teams.filter((k) => approvals?.[k] === 'approved').length;
  const rejected = teams.filter((k) => approvals?.[k] === 'rejected');
  if (rejected.length > 0) {
    return { color: 'red', reason: `Rechazo de ${rejected.join(', ')}`, detail: approvals };
  }

  const highRisks = (extraction?.riesgos_detectados ?? []).filter((r) => r.severidad === 'alta');
  if (highRisks.length > 0) reasons.push(`${highRisks.length} riesgo(s) alto(s) en contrato`);
  if (representatives?.recomendacion === 'requerir_documento_adicional') reasons.push('Apoderados requieren docs adicionales');

  if (okCount === need && reasons.length === 0) {
    return { color: 'green', reason: 'Todas las aprobaciones OK', detail: { approvals } };
  }
  return { color: 'yellow', reason: reasons.length ? reasons.join('; ') : `${okCount}/${need} aprobaciones`, detail: { approvals, reasons } };
}
