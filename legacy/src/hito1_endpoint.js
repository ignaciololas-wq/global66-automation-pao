// HTTP endpoint mínimo para que n8n invoque hito1_semaforo.
// Servidor express stub — deploy en Vercel/Render o como n8n custom node.

import http from 'node:http';
import { computeSemaphore } from './hito1_semaforo.js';
import { setSemaforo, setPhase, getApprovals } from './supabase_audit.js';

const server = http.createServer(async (req, res) => {
  if (req.method !== 'POST' || req.url !== '/hito1-semaforo') {
    res.statusCode = 404;
    return res.end('Not found');
  }
  let body = '';
  for await (const chunk of req) body += chunk;
  try {
    const input = JSON.parse(body);
    if (input.run_id && !input.approvals) {
      input.approvals = await getApprovals(input.run_id);
    }
    const result = computeSemaphore(input);
    if (input.run_id) {
      await setSemaforo(input.run_id, result.color, result.reason);
      await setPhase(input.run_id, result.color === 'green' ? 'fase2' : (result.color === 'red' ? 'rejected' : 'hito1'));
    }
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(result));
  } catch (e) {
    res.statusCode = 400;
    res.end(JSON.stringify({ error: e.message }));
  }
});

const PORT = process.env.PORT ?? 3000;
server.listen(PORT, () => console.log(`hito1 endpoint listening on ${PORT}`));
