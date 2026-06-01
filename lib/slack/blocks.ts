// Slack Block Kit builders para aprobaciones internas.

export type Team = 'compliance' | 'legal' | 'admin';

const TEAM_LABEL: Record<string, string> = { compliance: 'Compliance', legal: 'Legal', admin: 'Administración' };

interface ApprovalBlocksArgs {
  team: Team;
  runId: string;
  supplier: { razon_social?: string | null; tax_id?: string | null; pais?: string | null };
  contract: { tipo_contrato?: string | null; monto?: number | null; moneda?: string | null; vigencia_meses?: number | null };
  riskSummary?: string | null;
  draftUrl: string;
}

export function approvalBlocks({ team, runId, supplier, contract, riskSummary, draftUrl }: ApprovalBlocksArgs): unknown[] {
  const teamLabel = TEAM_LABEL[team] ?? team;
  return [
    { type: 'header', text: { type: 'plain_text', text: `📄 Nuevo contrato — revisión ${teamLabel}` } },
    {
      type: 'section',
      fields: [
        { type: 'mrkdwn', text: `*Proveedor:*\n${supplier.razon_social ?? '—'}` },
        { type: 'mrkdwn', text: `*Tax ID:*\n${supplier.tax_id ?? '—'}` },
        { type: 'mrkdwn', text: `*País:*\n${supplier.pais ?? '—'}` },
        { type: 'mrkdwn', text: `*Tipo:*\n${contract.tipo_contrato ?? '—'}` },
        { type: 'mrkdwn', text: `*Monto:*\n${contract.monto ?? '—'} ${contract.moneda ?? ''}` },
        { type: 'mrkdwn', text: `*Vigencia:*\n${contract.vigencia_meses ?? '—'} meses` },
      ],
    },
    ...(riskSummary
      ? [{ type: 'section', text: { type: 'mrkdwn', text: `*Riesgos detectados:*\n${riskSummary}` } }]
      : []),
    {
      type: 'actions',
      block_id: `approval:${runId}:${team}`,
      elements: [
        { type: 'button', style: 'primary', text: { type: 'plain_text', text: '✅ Aprobar' }, value: JSON.stringify({ run_id: runId, team, decision: 'approved' }), action_id: 'approve' },
        { type: 'button', style: 'danger', text: { type: 'plain_text', text: '❌ Rechazar' }, value: JSON.stringify({ run_id: runId, team, decision: 'rejected' }), action_id: 'reject' },
        { type: 'button', text: { type: 'plain_text', text: '💬 Pedir cambios' }, value: JSON.stringify({ run_id: runId, team, decision: 'requested_changes' }), action_id: 'request_changes' },
        { type: 'button', text: { type: 'plain_text', text: '📎 Ver borrador' }, url: draftUrl, action_id: 'view_draft' },
      ],
    },
    { type: 'context', elements: [{ type: 'mrkdwn', text: `Run ID: \`${runId}\`` }] },
  ];
}

export function riskSummaryFromExtraction(extracted: { riesgos_detectados?: { severidad: string; tipo: string; descripcion: string }[] } | null | undefined): string | null {
  const risks = extracted?.riesgos_detectados ?? [];
  if (risks.length === 0) return null;
  return risks
    .slice(0, 5)
    .map((r) => `• [${(r.severidad ?? '').toUpperCase()}] ${r.tipo}: ${r.descripcion}`)
    .join('\n');
}
