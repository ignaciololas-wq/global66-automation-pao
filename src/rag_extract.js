// RAG sobre documentos del proveedor. Extrae campos clave (RUT, nombres, vigencias)
// con Gemini Vision/PDF y valida match con datos del workflow.

import { GoogleGenAI } from '@google/genai';
import { sb, logAudit } from './supabase_audit.js';
import { MOCK } from './mock_mode.js';
import { retry } from './retry.js';

const API_KEY = process.env.GEMINI_API_KEY ?? process.env.GOOGLE_API_KEY;
const MODEL = process.env.GEMINI_MODEL ?? 'gemini-2.5-pro';
const ai = MOCK ? null : new GoogleGenAI({ apiKey: API_KEY });

const PROMPTS = {
  id_fiscal: `Sos especialista en documentos tributarios LATAM. Te paso una imagen/PDF de un documento de identificación fiscal de una empresa (e-RUT Chile, RUT DIAN Colombia, RFC México, RUC Perú, CUIT Argentina). Extraé en JSON:
{ "tax_id": "string", "razon_social": "string", "country_iso2": "string|null", "domicilio": "string|null", "fecha_emision": "YYYY-MM-DD|null", "vigente": boolean|null }
Solo JSON, sin texto adicional.`,
  id_personal_firmantes: `Documento de identidad personal (cédula/DNI/INE/pasaporte). Extraé JSON:
{ "nombre_completo": "string", "documento_numero": "string", "tipo_documento": "cedula|dni|pasaporte|ine|otro", "fecha_nacimiento": "YYYY-MM-DD|null", "fecha_vencimiento": "YYYY-MM-DD|null", "nacionalidad": "string|null" }
Solo JSON.`,
  poderes_vigentes: `Documento de poderes/escritura de representación legal de una empresa. Extraé JSON:
{ "empresa": "string", "tax_id_empresa": "string|null", "representantes": [{"nombre": "string", "documento": "string|null", "tipo_poder": "individual|conjunto|null"}], "fecha_escritura": "YYYY-MM-DD|null", "vigencia_hasta": "YYYY-MM-DD|null", "limitaciones": ["string"] }
Solo JSON.`,
  escritura_constitucion: `Escritura de constitución de empresa. Extraé JSON:
{ "razon_social": "string", "tax_id": "string|null", "fecha_constitucion": "YYYY-MM-DD|null", "objeto_social": "string|null", "domicilio": "string|null", "socios_fundadores": ["string"] }
Solo JSON.`,
  camara_comercio: `Certificado de Cámara de Comercio (Colombia). Extraé JSON:
{ "razon_social": "string", "nit": "string", "fecha_constitucion": "YYYY-MM-DD|null", "representante_legal": "string|null", "objeto_social": "string|null", "fecha_emision": "YYYY-MM-DD|null", "vigente": boolean|null }
Solo JSON.`,
  certificacion_bancaria: `Certificación bancaria del proveedor. Extraé JSON:
{ "titular": "string", "rut_titular": "string|null", "banco": "string", "numero_cuenta": "string", "tipo_cuenta": "string|null", "fecha_emision": "YYYY-MM-DD|null" }
Solo JSON.`,
  default: `Documento genérico de proveedor. Extraé cualquier campo identificable como JSON:
{ "tipo_documento_detectado": "string", "campos_relevantes": { ... } }
Solo JSON.`,
};

function pickPrompt(docType) {
  return PROMPTS[docType] ?? PROMPTS.default;
}

export async function extractFromUrl(fileUrl, docType) {
  if (MOCK) {
    return { extracted: { _mock: true, tax_id: 'mock-rut-001', razon_social: 'Mock SA' }, usage: { input_tokens: 0, output_tokens: 0 } };
  }
  // Fetch file
  const r = await fetch(fileUrl);
  if (!r.ok) throw new Error(`Cannot fetch ${fileUrl}: ${r.status}`);
  const buf = Buffer.from(await r.arrayBuffer());
  const mimeType = r.headers.get('content-type')?.split(';')[0] ?? 'application/octet-stream';

  // Gemini accepts inlineData with base64
  const resp = await retry(() => ai.models.generateContent({
    model: MODEL,
    contents: [{
      role: 'user',
      parts: [
        { text: pickPrompt(docType) },
        { inlineData: { mimeType, data: buf.toString('base64') } },
      ],
    }],
    config: {
      maxOutputTokens: 4000,
      responseMimeType: 'application/json',
      temperature: 0.1,
    },
  }), { retries: 2, minDelay: 1000 });

  const text = (resp.text ?? '').trim().replace(/^```json\n?/, '').replace(/\n?```$/, '');
  return {
    extracted: JSON.parse(text),
    usage: {
      input_tokens: resp.usageMetadata?.promptTokenCount ?? 0,
      output_tokens: resp.usageMetadata?.candidatesTokenCount ?? 0,
    },
  };
}

export async function extractAndValidate(uploadId, providerCtx) {
  const { data: upload } = await sb.from('provider_uploads').select('*').eq('id', uploadId).single();
  if (!upload) throw new Error('upload not found');

  await sb.from('provider_uploads').update({ rag_status: 'processing' }).eq('id', uploadId);

  let extracted, validation, validationStatus, notes;
  try {
    const result = await extractFromUrl(upload.file_url, upload.doc_type);
    extracted = result.extracted;
    validation = validateExtraction(upload.doc_type, extracted, providerCtx);
    validationStatus = validation.status;
    notes = validation.notes;
  } catch (e) {
    await sb.from('provider_uploads').update({
      rag_status: 'failed',
      rag_error: e.message,
    }).eq('id', uploadId);
    await logAudit(null, 'system', 'rag.failed', 'provider_upload', uploadId, { error: e.message });
    return;
  }

  await sb.from('provider_uploads').update({
    rag_status: 'done',
    rag_extracted: extracted,
    validation_status: validationStatus,
    validation_notes: notes,
  }).eq('id', uploadId);

  await logAudit(null, 'system', `rag.${validationStatus}`, 'provider_upload', uploadId, { doc_type: upload.doc_type, notes });
}

function validateExtraction(docType, extracted, providerCtx) {
  const norm = (s) => (s ?? '').toString().toLowerCase().replace(/[^a-z0-9]/g, '');

  if (docType === 'id_fiscal') {
    const declaredRut = norm(providerCtx.tax_id);
    const docRut = norm(extracted.tax_id);
    if (!docRut) return { status: 'manual_review', notes: 'Tax ID no detectado' };
    if (declaredRut && declaredRut !== docRut)
      return { status: 'mismatch', notes: `RUT declarado ${providerCtx.tax_id} vs documento ${extracted.tax_id}` };
    return { status: 'match', notes: 'RUT coincide' };
  }

  if (docType === 'id_personal_firmantes') {
    const declared = norm(providerCtx.representante_legal);
    const detected = norm(extracted.nombre_completo);
    if (!detected) return { status: 'manual_review', notes: 'Nombre no detectado' };
    if (declared && !declared.includes(detected.slice(0, 6)) && !detected.includes(declared.slice(0, 6)))
      return { status: 'manual_review', notes: `Nombre declarado ${providerCtx.representante_legal} vs documento ${extracted.nombre_completo}` };
    return { status: 'match', notes: 'Identidad firmante coincide' };
  }

  if (docType === 'poderes_vigentes') {
    if (extracted.vigencia_hasta) {
      const expDate = new Date(extracted.vigencia_hasta);
      if (expDate < new Date())
        return { status: 'mismatch', notes: `Poderes vencidos el ${extracted.vigencia_hasta}` };
    }
    return { status: 'match', notes: 'Poderes vigentes' };
  }

  return { status: 'manual_review', notes: 'Sin regla de validación específica' };
}
