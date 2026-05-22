// Cliente API Finnecto — endpoints verificados con docs reales.
// Docs: https://finnecto-api.readme.io
// Auth: Authorization: Bearer <FINNECTO_API_KEY>
// Base: https://api.finnecto.com (prod) | http://sandbox.finnecto.com (sandbox)
// Version: /v1.0/

import axios from 'axios';
import { MOCK, mockFinnectoCreateForm, mockFinnectoContracts } from './mock_mode.js';
import { retry } from './retry.js';

const BASE_URL = process.env.FINNECTO_BASE_URL ?? 'https://api.finnecto.com';
const API_KEY = process.env.FINNECTO_API_KEY;

export const client = axios.create({
  baseURL: `${BASE_URL}/v1.0`,
  timeout: 15000,
  headers: {
    Authorization: `Bearer ${API_KEY}`,
    'Content-Type': 'application/json',
  },
});

// ── Providers ──────────────────────────────────────────────────────────────

export async function listProviders({ national_type, status, type } = {}) {
  const { data } = await retry(() => client.get('/providers/', {
    params: { national_type, status, type },
  }));
  return data;
}

// ── Provider Forms (alta proveedor) ────────────────────────────────────────
// Alta de proveedor en Finnecto se hace creando un Form. Los campos del form
// dependen de la configuración en Finnecto (Administración → Formularios).
// Confirmar el form-id real antes de prod.

export async function listForms({ page = 1, page_size = 50 } = {}) {
  const { data } = await client.get('/forms/', { params: { page, page_size } });
  return data;
}

export async function listFormResponses(formId) {
  const { data } = await client.get(`/forms/${formId}/responses`);
  return data;
}

export async function createProviderForm(payload) {
  if (MOCK) return mockFinnectoCreateForm(payload);
  const { data } = await retry(() => client.post('/forms/', payload));
  return data;
}

// ── Contracts ──────────────────────────────────────────────────────────────

export async function listContracts({ provider_id, page = 1, page_size = 50 } = {}) {
  if (MOCK) return mockFinnectoContracts();
  const { data } = await retry(() => client.get('/contracts/', { params: { provider_id, page, page_size } }));
  return data;
}

export async function listExpiringContracts(daysAhead) {
  // Workaround: API no expone filtro expires_within. Traer contracts y filtrar client-side.
  const all = await listContracts({ page_size: 200 });
  const items = all.results ?? all.data ?? [];
  const now = Date.now();
  const horizon = now + daysAhead * 24 * 3600 * 1000;
  return items.filter((c) => {
    const end = c.end_date ?? c.expires_at;
    if (!end) return false;
    const ts = new Date(end).getTime();
    return ts >= now && ts <= horizon;
  });
}

// ── Purchase Orders ────────────────────────────────────────────────────────

export async function listPurchaseOrders({ provider, category, status, date, emission_date, society_id, page = 1 } = {}) {
  const { data } = await client.get('/purchase_orders/', {
    params: { provider, category, status, date, emission_date, society_id, page },
  });
  return data;
}

// ── Genéricos para otros endpoints ─────────────────────────────────────────
// Disponibles según docs: /accounts, /cost_centers, /categories, /products,
// /requests, /quotations, /invoices, /payments, /users, /policies,
// /transactions, /goods_receipts, /agent_accuracy

export async function get(path, params) {
  const { data } = await client.get(path, { params });
  return data;
}

export async function post(path, body) {
  const { data } = await client.post(path, body);
  return data;
}
