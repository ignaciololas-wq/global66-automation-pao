// Hito 1 — Semáforo automático post Fase 1.
// Verde: 3/3 aprobaciones + sin sanciones + poderes ok + Claude extract sin riesgo alto.
// Amarillo: 2/3 ok o riesgo medio. Rojo: bloqueado.

export function computeSemaphore({ approvals, sanctions, representatives, extraction, requiredTeams }) {
  const reasons = [];
  // Equipos a exigir: los configurados para el país (requiredTeams) o los 3 clásicos.
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
