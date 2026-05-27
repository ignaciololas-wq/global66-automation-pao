// PR3: aplicar comentarios al borrador con Gemini → genera v2 (draft).

import crypto from 'node:crypto';
import { GoogleGenAI } from '@google/genai';
import pdfParse from 'pdf-parse';
import { sb, logAudit } from './supabase_audit.js';
import { MOCK } from './mock_mode.js';

const API_KEY = process.env.GEMINI_API_KEY ?? process.env.GOOGLE_API_KEY;
const MODEL = process.env.GEMINI_MODEL ?? 'gemini-2.5-pro';
const BUCKET = 'contracts';
const ai = MOCK ? null : new GoogleGenAI({ apiKey: API_KEY });

const SYSTEM_PROMPT = `Sos un asistente experto en redacción contractual para Global66.
Vas a recibir el texto de un contrato (borrador) y una lista de comentarios hechos por aprobadores internos (Legal, Compliance, Admin).

Tu tarea: devolver el contrato ACTUALIZADO aplicando los cambios que piden los comentarios.

REGLAS ESTRICTAS:
1. Mantené el estilo, encabezados, numeración y estructura legal del contrato original.
2. Solo modificá lo que los comentarios piden. NO inventes cambios.
3. Si un comentario es ambiguo o requiere info que no tenés, dejalo como TODO entre [[ ]] en el texto y mencionalo en el diff_summary.
4. NO incluyas explicaciones dentro del contrato, solo el texto del contrato modificado.
5. Si dos comentarios se contradicen, elegí el más conservador (favor de Global66) y mencionalo en diff_summary.

Devolvé JSON EXACTO con esta forma:
{
  "updated_markdown": "<contrato completo en markdown, con cambios aplicados>",
  "diff_summary": "<resumen 3-6 bullets de los cambios>",
  "comments_addressed": [<lista de ids de comentarios que aplicaste>],
  "comments_unresolved": [<ids que no pudiste aplicar>],
  "todos": ["<info faltante que pediste>"]
}`;

async function downloadFile(storagePath) {
  const { data, error } = await sb.storage.from(BUCKET).download(storagePath);
  if (error) throw new Error(`storage.download: ${error.message}`);
  return Buffer.from(await data.arrayBuffer());
}

async function uploadFileBuffer({ workflowRunId, providerId, buffer, filename, mimeType, version, previousVersionId, uploadedBy, uploadedById, draftStatus = 'ai_draft' }) {
  const fileId = crypto.randomUUID();
  const storagePath = `${workflowRunId}/${fileId}-${filename.replace(/[^a-zA-Z0-9._-]+/g, '_')}`;
  const up = await sb.storage.from(BUCKET).upload(storagePath, buffer, { contentType: mimeType, upsert: false });
  if (up.error) throw new Error(`storage.upload: ${up.error.message}`);

  const sha256 = crypto.createHash('sha256').update(buffer).digest('hex');
  const { data, error } = await sb.from('contract_files').insert({
    id: fileId,
    workflow_run_id: workflowRunId,
    provider_id: providerId ?? null,
    kind: 'main',
    storage_path: storagePath,
    filename,
    mime_type: mimeType,
    size_bytes: buffer.length,
    sha256,
    uploaded_by: uploadedBy,
    uploaded_by_id: uploadedById ?? null,
    version,
    previous_version_id: previousVersionId,
    draft_status: draftStatus,
  }).select().single();
  if (error) {
    await sb.storage.from(BUCKET).remove([storagePath]).catch(() => {});
    throw new Error(error.message);
  }
  return data;
}

async function extractText(buffer, mimeType) {
  if (mimeType === 'application/pdf') {
    const out = await pdfParse(buffer);
    return out.text ?? '';
  }
  // .docx: usar Gemini multi-modal directo (mejor que mammoth server-side).
  // Como fallback simple, intentar decodear como UTF-8 (no ideal pero funciona como signal).
  return buffer.toString('utf8').slice(0, 200000);
}

export async function runAiEdit({ workflowRunId, sourceFileId, requestedBy, requestedById, extraPrompt }) {
  if (!ai) throw new Error('GEMINI_API_KEY no seteada');

  const { data: source, error } = await sb
    .from('contract_files')
    .select('id, storage_path, filename, mime_type, version, workflow_run_id, provider_id')
    .eq('id', sourceFileId)
    .single();
  if (error || !source) throw new Error('source file not found');

  const { data: pending } = await sb
    .from('file_comments')
    .select('id, body, author_email, page_number, created_at, resolved')
    .eq('file_id', sourceFileId)
    .is('deleted_at', null)
    .eq('resolved', false)
    .order('created_at', { ascending: true });
  if (!pending?.length) throw new Error('no hay comentarios pendientes para aplicar');

  const job = await sb.from('ai_edit_jobs').insert({
    workflow_run_id: workflowRunId,
    source_file_id: sourceFileId,
    requested_by: requestedBy,
    requested_by_id: requestedById ?? null,
    comments_snapshot: pending,
    prompt: extraPrompt ?? null,
    status: 'running',
  }).select().single();
  if (job.error) throw new Error(job.error.message);
  const jobId = job.data.id;

  try {
    const buffer = await downloadFile(source.storage_path);
    const text = await extractText(buffer, source.mime_type);

    const commentsBlock = pending
      .map((c, i) => `### Comentario ${i + 1} (id=${c.id}, por ${c.author_email}${c.page_number ? `, p.${c.page_number}` : ''})\n${c.body}`)
      .join('\n\n');

    const userPrompt = `${extraPrompt ? `Instrucción extra del usuario: ${extraPrompt}\n\n---\n\n` : ''}TEXTO DEL CONTRATO ACTUAL:\n\n\`\`\`\n${text.slice(0, 60000)}\n\`\`\`\n\n---\n\nCOMENTARIOS DE LOS APROBADORES (aplicalos):\n\n${commentsBlock}`;

    const r = await ai.models.generateContent({
      model: MODEL,
      contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
      config: {
        systemInstruction: SYSTEM_PROMPT,
        responseMimeType: 'application/json',
        temperature: 0.2,
      },
    });

    const raw = r.text ?? r.response?.text?.() ?? '';
    let parsed;
    try { parsed = JSON.parse(raw); } catch {
      const m = raw.match(/\{[\s\S]*\}/);
      if (m) parsed = JSON.parse(m[0]);
      else throw new Error('IA no devolvió JSON parseable');
    }

    // Generar PDF simple del texto modificado (markdown → texto plano fitted en PDF).
    const newPdf = await renderMarkdownToPdf(parsed.updated_markdown, source.filename);

    const baseName = source.filename.replace(/\.(pdf|docx?|txt)$/i, '');
    const newFilename = `${baseName}_v${(source.version ?? 1) + 1}.pdf`;
    const draft = await uploadFileBuffer({
      workflowRunId,
      providerId: source.provider_id,
      buffer: newPdf,
      filename: newFilename,
      mimeType: 'application/pdf',
      version: (source.version ?? 1) + 1,
      previousVersionId: source.id,
      uploadedBy: requestedBy + ' (vía IA)',
      uploadedById: requestedById,
      draftStatus: 'ai_draft',
    });

    await sb.from('ai_edit_jobs').update({
      draft_file_id: draft.id,
      status: 'ready_for_review',
      finished_at: new Date().toISOString(),
      diff_summary: parsed.diff_summary ?? null,
    }).eq('id', jobId);

    await logAudit(workflowRunId, requestedBy, 'ai_edit.generated', 'ai_edit_job', jobId, {
      source_file_id: sourceFileId, draft_file_id: draft.id, comments: pending.length,
    });

    return { job_id: jobId, draft_file_id: draft.id, diff_summary: parsed.diff_summary, todos: parsed.todos ?? [], comments_unresolved: parsed.comments_unresolved ?? [] };
  } catch (e) {
    await sb.from('ai_edit_jobs').update({
      status: 'failed',
      finished_at: new Date().toISOString(),
      error_message: e.message,
    }).eq('id', jobId);
    throw e;
  }
}

export async function applyAiDraft({ jobId, by, byId }) {
  const { data: job, error } = await sb
    .from('ai_edit_jobs')
    .select('*')
    .eq('id', jobId)
    .single();
  if (error || !job) throw new Error('job not found');
  if (job.status !== 'ready_for_review') throw new Error('job no está listo (status=' + job.status + ')');

  // Archivar source + marcar draft como activo.
  await sb.from('contract_files').update({
    archived_at: new Date().toISOString(),
    draft_status: 'superseded',
  }).eq('id', job.source_file_id);

  await sb.from('contract_files').update({
    draft_status: 'active',
  }).eq('id', job.draft_file_id);

  // Marcar comentarios resueltos.
  await sb.from('file_comments').update({ resolved: true }).eq('file_id', job.source_file_id).eq('resolved', false);

  await sb.from('ai_edit_jobs').update({ status: 'applied' }).eq('id', jobId);

  await logAudit(job.workflow_run_id, by, 'ai_edit.applied', 'ai_edit_job', jobId, {
    new_file_id: job.draft_file_id, archived_file_id: job.source_file_id,
  });

  return { ok: true };
}

export async function discardAiDraft({ jobId, by }) {
  const { data: job } = await sb.from('ai_edit_jobs').select('*').eq('id', jobId).single();
  if (!job) throw new Error('job not found');

  if (job.draft_file_id) {
    const { data: draft } = await sb.from('contract_files').select('storage_path').eq('id', job.draft_file_id).single();
    if (draft?.storage_path) {
      await sb.storage.from(BUCKET).remove([draft.storage_path]).catch(() => {});
    }
    await sb.from('contract_files').delete().eq('id', job.draft_file_id);
  }
  await sb.from('ai_edit_jobs').update({ status: 'discarded' }).eq('id', jobId);
  await logAudit(job.workflow_run_id, by, 'ai_edit.discarded', 'ai_edit_job', jobId, {});
  return { ok: true };
}

export async function listJobsForRun(workflowRunId) {
  const { data } = await sb
    .from('ai_edit_jobs')
    .select('id, source_file_id, draft_file_id, requested_by, status, diff_summary, error_message, created_at, finished_at')
    .eq('workflow_run_id', workflowRunId)
    .order('created_at', { ascending: false });
  return data ?? [];
}

// Renderiza markdown a PDF simple usando pdf-lib (sin deps externas pesadas).
async function renderMarkdownToPdf(markdown, originalName) {
  const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib');
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const fontItalic = await pdf.embedFont(StandardFonts.HelveticaOblique);

  const pageWidth = 595; // A4
  const pageHeight = 842;
  const margin = 50;
  const maxWidth = pageWidth - margin * 2;
  const lineHeight = 14;
  const headingHeight = 22;

  let page = pdf.addPage([pageWidth, pageHeight]);
  let y = pageHeight - margin;

  function newPage() {
    page = pdf.addPage([pageWidth, pageHeight]);
    y = pageHeight - margin;
  }

  function wrap(text, fontObj, fontSize) {
    const words = text.split(/\s+/);
    const lines = [];
    let cur = '';
    for (const w of words) {
      const test = cur ? cur + ' ' + w : w;
      if (fontObj.widthOfTextAtSize(test, fontSize) <= maxWidth) cur = test;
      else { if (cur) lines.push(cur); cur = w; }
    }
    if (cur) lines.push(cur);
    return lines;
  }

  function drawLine(text, { bold = false, italic = false, size = 11, indent = 0 } = {}) {
    if (y < margin + lineHeight) newPage();
    const f = bold ? fontBold : italic ? fontItalic : font;
    page.drawText(text, { x: margin + indent, y, size, font: f, color: rgb(0.08, 0.13, 0.28) });
  }

  for (const rawLine of markdown.split('\n')) {
    const line = rawLine.trimEnd();
    if (!line.trim()) { y -= lineHeight; continue; }
    if (line.startsWith('# ')) {
      if (y < margin + headingHeight + lineHeight) newPage();
      y -= headingHeight;
      drawLine(line.slice(2).trim(), { bold: true, size: 16 });
      y -= 6;
      continue;
    }
    if (line.startsWith('## ')) {
      if (y < margin + headingHeight + lineHeight) newPage();
      y -= headingHeight;
      drawLine(line.slice(3).trim(), { bold: true, size: 13 });
      y -= 4;
      continue;
    }
    if (line.startsWith('### ')) {
      drawLine(line.slice(4).trim(), { bold: true, size: 12 });
      y -= lineHeight;
      continue;
    }
    const isListItem = /^[-*]\s/.test(line);
    const text = isListItem ? '• ' + line.replace(/^[-*]\s/, '') : line;
    const lines = wrap(text, font, 11);
    for (const wrapped of lines) {
      if (y < margin + lineHeight) newPage();
      drawLine(wrapped, { indent: isListItem ? 12 : 0 });
      y -= lineHeight;
    }
  }

  return Buffer.from(await pdf.save());
}
