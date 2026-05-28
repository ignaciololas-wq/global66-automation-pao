// Alertas de vencimiento — 9 / 6 / 3 meses + 30 / 7 días.
// Corre como cron diario. Lee Finecto, notifica Slack + email owner.

// Stack B: lee de Supabase (providers + contracts) en vez de Finnecto.
import { listExpiringContracts } from './providers.js';
import axios from 'axios';

const ALERT_WINDOWS = [
  { days: 270, label: '9 meses', channel: 'preaviso' },
  { days: 180, label: '6 meses', channel: 'preaviso' },
  { days: 90, label: '3 meses', channel: 'preaviso' },
  { days: 30, label: '30 días', channel: 'urgent' },
  { days: 7, label: '7 días', channel: 'critical' },
];

async function postSlack(channel, blocks) {
  await axios.post(
    'https://slack.com/api/chat.postMessage',
    { channel, blocks },
    { headers: { Authorization: `Bearer ${process.env.SLACK_BOT_TOKEN}` } },
  );
}

function block(contract, label) {
  const owner = contract.owner_email ?? contract.owner_slack_id ?? 'sin owner';
  const name = contract.provider_name ?? contract.supplier_name ?? contract.id;
  return [
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `⚠️ *Contrato vence en ${label}*\n*Proveedor:* ${name}\n*Tipo:* ${contract.tipo_contrato ?? contract.type}\n*Monto:* ${contract.amount} ${contract.currency}\n*Vence:* ${contract.expires_at}\n*Owner:* ${owner}`,
      },
    },
    {
      type: 'actions',
      elements: [
        { type: 'button', text: { type: 'plain_text', text: 'Renovar' }, value: `renew:${contract.id}` },
        { type: 'button', text: { type: 'plain_text', text: 'No renovar' }, value: `cancel:${contract.id}` },
      ],
    },
  ];
}

export async function runDailyAlerts() {
  const results = [];
  for (const win of ALERT_WINDOWS) {
    const contracts = await listExpiringContracts(win.days);
    const dueToday = contracts.filter((c) => daysUntil(c.expires_at) === win.days);

    for (const c of dueToday) {
      const ch = win.channel === 'critical'
        ? process.env.SLACK_ADMIN_CHANNEL
        : process.env.SLACK_COMPLIANCE_CHANNEL;
      await postSlack(ch, block(c, win.label));
      results.push({ contract: c.id, window: win.label });
    }
  }
  return results;
}

function daysUntil(iso) {
  const ms = new Date(iso).getTime() - Date.now();
  return Math.floor(ms / (24 * 3600 * 1000));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const r = await runDailyAlerts();
  console.log(JSON.stringify(r, null, 2));
}
