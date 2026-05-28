// Hito 1 — Semáforo automático post Fase 1.
// Verde: 3/3 aprobaciones + sin sanciones + poderes ok + Claude extract sin riesgo alto.
// Amarillo: 2/3 ok o riesgo medio. Rojo: bloqueado.

export function computeSemaphore({ approvals, sanctions, representatives, extraction }) {
  const reasons = [];

  if (sanctions?.hit) {
    return { color: 'red', reason: 'Match en lista de sanciones', detail: sanctions.matches };
  }

  if (representatives?.recomendacion === 'rechazar') {
    return { color: 'red', reason: 'Apoderados rechazados', detail: representatives };
  }

  const okCount = ['compliance', 'legal', 'admin'].filter((k) => approvals?.[k] === 'approved').length;
  const rejected = ['compliance', 'legal', 'admin'].filter((k) => approvals?.[k] === 'rejected');

  if (rejected.length > 0) {
    return { color: 'red', reason: `Rechazo de ${rejected.join(', ')}`, detail: approvals };
  }

  const highRisks = (extraction?.riesgos_detectados ?? []).filter((r) => r.severidad === 'alta');
  if (highRisks.length > 0) reasons.push(`${highRisks.length} riesgo(s) alto(s) en contrato`);
  if (representatives?.recomendacion === 'requerir_documento_adicional') reasons.push('Apoderados requieren docs adicionales');

  if (okCount === 3 && reasons.length === 0) {
    return { color: 'green', reason: 'Todas las aprobaciones OK', detail: { approvals } };
  }

  if (okCount >= 2 || reasons.length > 0) {
    return { color: 'yellow', reason: reasons.length ? reasons.join('; ') : `${okCount}/3 aprobaciones`, detail: { approvals, reasons } };
  }

  return { color: 'yellow', reason: 'Aprobaciones pendientes', detail: { approvals } };
}
