// Simulador de Slack interactive payload con HMAC válido.
// Uso: node scripts/sim_slack_click.js <run_id> <team> <decision>
//   ej: node scripts/sim_slack_click.js abc-123 legal approved

import 'dotenv/config';
import crypto from 'node:crypto';

const [, , runId, team, decision] = process.argv;
if (!runId || !team || !decision) {
  console.error('Uso: node scripts/sim_slack_click.js <run_id> <team> <decision>');
  console.error('  team: compliance|legal|admin');
  console.error('  decision: approved|rejected|requested_changes');
  process.exit(1);
}

const SERVER = process.env.SERVER_BASE_LOCAL ?? 'http://localhost:3000';
const SECRET = process.env.SLACK_SIGNING_SECRET;
if (!SECRET) {
  console.error('SLACK_SIGNING_SECRET no seteado. Modo dev: el server rechazará HMAC.');
  console.error('Para test: setear cualquier valor en .env y aquí.');
}

const payload = {
  type: 'block_actions',
  user: { id: 'U_SIM_USER', name: 'sim@global66.com', email: 'sim@global66.com' },
  actions: [
    {
      action_id: { approved: 'approve', rejected: 'reject', requested_changes: 'request_changes' }[decision],
      block_id: `approval:${runId}:${team}`,
      value: JSON.stringify({ run_id: runId, team, decision }),
    },
  ],
};

const body = `payload=${encodeURIComponent(JSON.stringify(payload))}`;
const ts = Math.floor(Date.now() / 1000).toString();
const base = `v0:${ts}:${body}`;
const sig = 'v0=' + crypto.createHmac('sha256', SECRET ?? 'dev').update(base).digest('hex');

const r = await fetch(`${SERVER}/slack-callback`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/x-www-form-urlencoded',
    'X-Slack-Request-Timestamp': ts,
    'X-Slack-Signature': sig,
  },
  body,
});

const text = await r.text();
console.log(`Status: ${r.status}`);
console.log(text);
process.exit(r.ok ? 0 : 1);
