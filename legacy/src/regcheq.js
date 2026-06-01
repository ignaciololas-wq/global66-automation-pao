// Regcheq AML/PEP validation (nodo 4).
// Complementa lista_negra.js (OpenSanctions) con PEP Chile + funcionarios públicos + listas locales.
// Docs: https://app.theneo.io/regcheq/external-api

import axios from 'axios';
import { MOCK } from './mock_mode.js';

const BASE = process.env.REGCHEQ_BASE_URL ?? 'https://external-api.regcheq.com';
const KEY = process.env.REGCHEQ_API_KEY;

const TIMEOUT = 15000;

function assertKey() {
  if (!KEY) throw new Error('REGCHEQ_API_KEY missing');
}

// ── Limpia RUT chileno → dígitos planos: "76.123.456-7" → "761234567" ────────
// RegCheq almacena y busca el dni SIN puntos NI guión. Conservar el guión hacía
// que todo GET /record devolviera 404 ("record not found") aunque la ficha existiera.
function normalizeDni(dni) {
  if (!dni) return dni;
  return String(dni).replace(/[.\-\s]/g, '').trim();
}

// ── POST /record — crea/actualiza ficha ─────────────────────────────────────
export async function upsertRecord(payload) {
  assertKey();
  const body = {};
  for (const k of Object.keys(payload)) if (payload[k] != null) body[k] = payload[k];
  if (body.dni) body.dni = normalizeDni(body.dni);

  const { data } = await axios.post(`${BASE}/record/${KEY}`, body, { timeout: TIMEOUT });
  return data;
}

// ── GET /record/{dni} — obtiene perfil + listas + riesgo ────────────────────
export async function getRecord(dni) {
  assertKey();
  const norm = normalizeDni(dni);
  const { data } = await axios.get(`${BASE}/record/${norm}/${KEY}`, { timeout: TIMEOUT });
  return data;
}

// ── GET /interest-list — lista negra interna ────────────────────────────────
export async function getInterestList() {
  assertKey();
  const { data } = await axios.get(`${BASE}/interest-list/${KEY}`, { timeout: TIMEOUT });
  return data;
}

// ── POST /interest-list — registra match en lista interna ───────────────────
export async function addToInterestList({ dni, name, personType, reason, status = 'active' }) {
  assertKey();
  const { data } = await axios.post(
    `${BASE}/interest-list/${KEY}`,
    { dni: normalizeDni(dni), name, personType, reason, status },
    { timeout: TIMEOUT },
  );
  return data;
}

// ── Reglas de bloqueo (AML estándar) ────────────────────────────────────────
// Lee respuesta de GET /record y decide acción.
// Solo sanciones internacionales (OFAC/ONU/UE) bloquean duro. PEP, riesgo alto,
// socios riesgosos y causas penales chilenas → review (revisión humana).
const CRITICAL_LISTS = [
  'internationalOrganizations', // OFAC/ONU/UE consolidado
  'ofacAddressResult',          // OFAC por dirección
  'bicResult',                  // sanciones bancarias/BIC
];
const REVIEW_LISTS = [
  'pepChile',
  'funcPublicChile',
  'pdiResult',
  'rtpResult',
  'gafiResult',
  'internList',
  'regcheqList',
  'keywordsResult',
  'screeningGlobal',         // adverse media / screening global
  'associatedRisk',          // socios/beneficiarios con riesgo
  'secondCriminalCasesChile', // causas penales chilenas
];

// "High Risk" / "Alto" / "high" → 'high'; "Medium Risk" / "Medio" → 'medium'
function normalizeRisk(value) {
  const s = String(value ?? '').toLowerCase();
  if (s.includes('high') || s.includes('alto')) return 'high';
  if (s.includes('medium') || s.includes('medio')) return 'medium';
  if (s.includes('low') || s.includes('bajo')) return 'low';
  return null;
}

export function evaluateRecord(record) {
  if (!record || (Array.isArray(record) && record.length === 0)) {
    return { decision: 'unknown', reason: 'record_not_found', matches: [] };
  }
  const r = Array.isArray(record) ? record[0] : record;
  const listas = r.listas ?? r;
  const matches = [];

  for (const key of [...CRITICAL_LISTS, ...REVIEW_LISTS]) {
    const entry = listas?.[key];
    if (entry?.coincidence === true) {
      matches.push({
        list: key,
        risk: entry.risk ?? null,
        info: entry.info ?? null,
        data: entry.data ?? null,
      });
    }
  }

  const hasCritical = matches.some((m) => CRITICAL_LISTS.includes(m.list));
  const hasReview = matches.some((m) => REVIEW_LISTS.includes(m.list));
  const effectiveRisk = normalizeRisk(r.effectiveRisk ?? r.calculatedRisk);

  let decision = 'approve';
  let reason = 'no_matches';

  if (hasCritical) {
    decision = 'block';
    reason = 'critical_list_match';
  } else if (hasReview || effectiveRisk === 'high') {
    decision = 'review';
    reason = hasReview ? 'review_list_match' : 'high_risk';
  } else if (effectiveRisk === 'medium') {
    decision = 'approve_flag';
    reason = 'medium_risk';
  }

  return { decision, reason, effectiveRisk, calculatedRisk: r.calculatedRisk ?? null, matches, raw: r };
}

// ── Orquestador nodo 4: valida proveedor + relacionados ─────────────────────
// supplier: { razon_social, tax_id, pais, email_contacto, representante_legal, ... }
// relations: [{ dni, name, type }]  (type: representant/beneficiary/manager/declarant/effectiveControl)
export async function checkSupplier(supplier, relations = []) {
  if (MOCK) {
    return {
      decision: 'approve',
      reason: 'mock_mode',
      company: { decision: 'approve', matches: [] },
      relations: [],
    };
  }
  if (!KEY) {
    return { decision: 'skip', reason: 'no_api_key', company: null, relations: [] };
  }

  // 1) Upsert ficha empresa con personsRelations
  const personsRelations = relations
    .filter((r) => r.dni)
    .map((r) => ({
      dni: normalizeDni(r.dni),
      personType: 'natural',
      type: r.type ?? 'representant',
      ...(r.name ? { name: r.name } : {}),
      ...(r.fatherName ? { fatherName: r.fatherName } : {}),
    }));

  // Si la ficha ya existe en RegCheq, POST /record devuelve 500 (personType
  // inmutable). Probamos GET primero; si la ficha existe, saltamos el upsert.
  // El upsert solo crea fichas nuevas — su fallo NO debe abortar el check.
  let companyRecord = null;
  try {
    companyRecord = await getRecord(supplier.tax_id);
  } catch (e) {
    if (e.response?.status !== 404) {
      console.error('[regcheq] getRecord pre-check failed:', e.response?.status ?? e.message);
    }
  }

  if (!companyRecord) {
    try {
      await upsertRecord({
        dni: supplier.tax_id,
        personType: 'legal',
        dniType: 'RUT',
        socialReason: supplier.razon_social,
        email: supplier.email_contacto,
        country: supplier.pais,
        nationality: supplier.pais,
        ...(personsRelations.length ? { personsRelations } : {}),
      });
    } catch (e) {
      console.error('[regcheq] upsertRecord failed (ficha quizá ya existe):', e.response?.status ?? e.message);
    }
    // 2) GET ficha empresa (tras crearla)
    companyRecord = await getRecord(supplier.tax_id);
  }

  const companyEval = evaluateRecord(companyRecord);

  // 3) GET ficha cada relacionado
  const relationsEval = [];
  for (const rel of personsRelations) {
    try {
      const rec = await getRecord(rel.dni);
      relationsEval.push({ dni: rel.dni, type: rel.type, ...evaluateRecord(rec) });
    } catch (e) {
      relationsEval.push({ dni: rel.dni, type: rel.type, decision: 'error', reason: e.message });
    }
  }

  // 4) Decisión agregada — peor caso gana
  const order = { block: 4, review: 3, approve_flag: 2, approve: 1, unknown: 0, skip: 0, error: 0 };
  const all = [companyEval, ...relationsEval];
  const worst = all.reduce((acc, x) => (order[x.decision] > order[acc.decision] ? x : acc), companyEval);

  return {
    decision: worst.decision,
    reason: worst.reason,
    company: companyEval,
    relations: relationsEval,
  };
}
