// E2E test of fixed checkSupplier — GREXSA. Verifies GET-first + new rules.
import { checkSupplier, evaluateRecord, getRecord } from '../src/regcheq.js';

const supplier = {
  razon_social: 'GREXSA COMERCIAL SPA',
  tax_id: '78.259.067-7', // dotted+hyphen on purpose — normalizeDni must clean it
  pais: 'Chile',
  email_contacto: 'test@grexsa.cl',
};
const relations = [
  { dni: '12363872-7', name: 'Ricardo PINO GONZALEZ', type: 'beneficiary' },
  { dni: '12928516-8', name: 'Lorna JARA RIQUELME', type: 'representant' },
];

const res = await checkSupplier(supplier, relations);
console.log('=== checkSupplier result ===');
console.log('decision:', res.decision, '| reason:', res.reason);
console.log('company.decision:', res.company?.decision, '| effectiveRisk:', res.company?.effectiveRisk);
console.log('company.matches:', JSON.stringify(res.company?.matches?.map((m) => ({ list: m.list, risk: m.risk })), null, 2));
console.log('relations evals:', res.relations.map((r) => ({ dni: r.dni, decision: r.decision, reason: r.reason })));
console.log('has raw ficha:', !!res.company?.raw, '| raw name:', res.company?.raw?.name);
