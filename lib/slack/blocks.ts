// Slack Block Kit builders para aprobaciones internas.

export type Team = 'compliance' | 'legal' | 'admin';

const TEAM_LABEL: Record<string, string> = { compliance: 'Compliance', legal: 'Legal', admin: 'Administración' };

// Subconjunto de columnas de workflow_runs que mostramos al aprobador.
export interface ApprovalRunInfo {
  razon_social?: string | null;
  tax_id?: string | null;
  pais?: string | null;
  tipo_proveedor?: string | null;
  monto?: number | null;
  moneda?: string | null;
  periodicidad?: string | null;
  servicio_descripcion?: string | null;
  solicitante_nombre?: string | null;
  solicitante_area?: string | null;
  sociedad_contratante?: string | null;
  representante_legal?: string | null;
  tipo_duracion?: string | null;
  fecha_inicio?: string | null;
  fecha_fin?: string | null;
}

interface ApprovalBlocksArgs {
  team: Team;
  runId: string;
  run: ApprovalRunInfo;
  riskSummary?: string | null;
  draftUrl: string;
}

const fmtMoney = (m?: number | null, cur?: string | null) =>
  m == null ? '—' : `${new Intl.NumberFormat('es-CL').format(m)} ${cur ?? ''}`.trim();

export function approvalBlocks({ team, runId, run, riskSummary, draftUrl }: ApprovalBlocksArgs): unknown[] {
  const teamLabel = TEAM_LABEL[team] ?? team;
  const duracion = [run.tipo_duracion, run.fecha_inicio && `desde ${run.fecha_inicio}`, run.fecha_fin && `hasta ${run.fecha_fin}`]
    .filter(Boolean).join(' · ') || '—';

  const blocks: unknown[] = [
    { type: 'header', text: { type: 'plain_text', text: `📄 Nuevo contrato — revisión ${teamLabel}` } },
    {
      type: 'section',
      fields: [
        { type: 'mrkdwn', text: `*Proveedor:*\n${run.razon_social ?? '—'}` },
        { type: 'mrkdwn', text: `*Tax ID:*\n${run.tax_id ?? '—'}` },
        { type: 'mrkdwn', text: `*País:*\n${run.pais ?? '—'}` },
        { type: 'mrkdwn', text: `*Tipo proveedor:*\n${run.tipo_proveedor ?? '—'}` },
        { type: 'mrkdwn', text: `*Monto:*\n${fmtMoney(run.monto, run.moneda)}${run.periodicidad ? ` (${run.periodicidad})` : ''}` },
        { type: 'mrkdwn', text: `*Sociedad:*\n${run.sociedad_contratante ?? '—'}` },
        { type: 'mrkdwn', text: `*Solicitante:*\n${run.solicitante_nombre ?? '—'}${run.solicitante_area ? ` (${run.solicitante_area})` : ''}` },
        { type: 'mrkdwn', text: `*Duración:*\n${duracion}` },
      ],
    },
  ];

  if (run.servicio_descripcion) {
    blocks.push({ type: 'section', text: { type: 'mrkdwn', text: `*Servicio:*\n${String(run.servicio_descripcion).slice(0, 600)}` } });
  }
  if (run.representante_legal) {
    blocks.push({ type: 'context', elements: [{ type: 'mrkdwn', text: `Representante legal: *${run.representante_legal}*` }] });
  }
  if (riskSummary) {
    blocks.push({ type: 'section', text: { type: 'mrkdwn', text: `*⚠️ Riesgos detectados:*\n${riskSummary}` } });
  }

  blocks.push(
    {
      type: 'actions',
      block_id: `approval:${runId}:${team}`,
      elements: [
        { type: 'button', style: 'primary', text: { type: 'plain_text', text: '✅ Aprobar' }, value: JSON.stringify({ run_id: runId, team, decision: 'approved' }), action_id: 'approve' },
        { type: 'button', style: 'danger', text: { type: 'plain_text', text: '❌ Rechazar' }, value: JSON.stringify({ run_id: runId, team, decision: 'rejected' }), action_id: 'reject' },
        { type: 'button', text: { type: 'plain_text', text: '💬 Pedir cambios' }, value: JSON.stringify({ run_id: runId, team, decision: 'requested_changes' }), action_id: 'request_changes' },
        { type: 'button', text: { type: 'plain_text', text: '🔎 Ver solicitud completa' }, url: draftUrl, action_id: 'view_draft' },
      ],
    },
    { type: 'context', elements: [{ type: 'mrkdwn', text: `Solicitud: \`${runId}\` · revisá el detalle completo antes de decidir` }] },
  );
  return blocks;
}

export function riskSummaryFromExtraction(extracted: { riesgos_detectados?: { severidad: string; tipo: string; descripcion: string }[] } | null | undefined): string | null {
  const risks = extracted?.riesgos_detectados ?? [];
  if (risks.length === 0) return null;
  return risks
    .slice(0, 5)
    .map((r) => `• [${(r.severidad ?? '').toUpperCase()}] ${r.tipo}: ${r.descripcion}`)
    .join('\n');
}
