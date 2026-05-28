// Slack Block Kit builders para aprobaciones.

export function approvalBlocks({ team, runId, supplier, contract, riskSummary, draftUrl }) {
  const teamLabel = { compliance: 'Compliance', legal: 'Legal', admin: 'Administración' }[team] ?? team;
  return [
    {
      type: 'header',
      text: { type: 'plain_text', text: `📄 Nuevo contrato — revisión ${teamLabel}` },
    },
    {
      type: 'section',
      fields: [
        { type: 'mrkdwn', text: `*Proveedor:*\n${supplier.razon_social}` },
        { type: 'mrkdwn', text: `*Tax ID:*\n${supplier.tax_id}` },
        { type: 'mrkdwn', text: `*País:*\n${supplier.pais}` },
        { type: 'mrkdwn', text: `*Tipo:*\n${contract.tipo_contrato ?? '—'}` },
        { type: 'mrkdwn', text: `*Monto:*\n${contract.monto} ${contract.moneda}` },
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
        {
          type: 'button',
          style: 'primary',
          text: { type: 'plain_text', text: '✅ Aprobar' },
          value: JSON.stringify({ run_id: runId, team, decision: 'approved' }),
          action_id: 'approve',
        },
        {
          type: 'button',
          style: 'danger',
          text: { type: 'plain_text', text: '❌ Rechazar' },
          value: JSON.stringify({ run_id: runId, team, decision: 'rejected' }),
          action_id: 'reject',
        },
        {
          type: 'button',
          text: { type: 'plain_text', text: '💬 Pedir cambios' },
          value: JSON.stringify({ run_id: runId, team, decision: 'requested_changes' }),
          action_id: 'request_changes',
        },
        {
          type: 'button',
          text: { type: 'plain_text', text: '📎 Ver borrador' },
          url: draftUrl,
          action_id: 'view_draft',
        },
      ],
    },
    { type: 'context', elements: [{ type: 'mrkdwn', text: `Run ID: \`${runId}\`` }] },
  ];
}

export function riskSummaryFromExtraction(extracted) {
  const risks = extracted?.riesgos_detectados ?? [];
  if (risks.length === 0) return null;
  return risks
    .slice(0, 5)
    .map((r) => `• [${r.severidad.toUpperCase()}] ${r.tipo}: ${r.descripcion}`)
    .join('\n');
}

export function semaphoreSummaryBlocks({ runId, color, reason, approvals }) {
  const emoji = { green: '🟢', yellow: '🟡', red: '🔴' }[color];
  return [
    { type: 'header', text: { type: 'plain_text', text: `${emoji} Hito 1 — ${color.toUpperCase()}` } },
    { type: 'section', text: { type: 'mrkdwn', text: `*Razón:* ${reason}\n*Run:* \`${runId}\`` } },
    {
      type: 'section',
      fields: Object.entries(approvals ?? {}).map(([team, dec]) => ({
        type: 'mrkdwn',
        text: `*${team}:* ${dec ?? 'pendiente'}`,
      })),
    },
  ];
}
