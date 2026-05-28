import 'server-only';
import crypto from 'node:crypto';
import Anthropic from '@anthropic-ai/sdk';
import { createAdminClient } from '@/lib/supabase/server';

const ANTHROPIC_KEY =
  process.env.ANTHROPIC_API_KEY ??
  process.env.ANHTROPIC_API_KEY ??
  process.env.CLAUDE_API_KEY ??
  null;
const MODEL = process.env.ANTHROPIC_MODEL ?? 'claude-sonnet-4-6';
const BUCKET = 'contracts';

const client: Anthropic | null = ANTHROPIC_KEY ? new Anthropic({ apiKey: ANTHROPIC_KEY }) : null;

const SYSTEM_PROMPT = `Eres un asistente experto en redacción contractual para Global66.
Vas a recibir el texto de un contrato (borrador) y una lista de comentarios hechos por aprobadores internos (Legal, Compliance, Admin).

Tu tarea: devolver el contrato ACTUALIZADO aplicando los cambios que piden los comentarios.

REGLAS ESTRICTAS:
1. Mantén el estilo, encabezados, numeración y estructura legal del contrato original.
2. Solo modifica lo que los comentarios piden. NO inventes cambios.
3. Si un comentario es ambiguo o requiere info que no tienes, dejalo como TODO entre [[ ]] en el texto y mencionalo en el diff_summary.
4. NO incluyas explicaciones dentro del contrato, solo el texto del contrato modificado.
5. Si dos comentarios se contradicen, elige el más conservador (favor de Global66) y mencionalo en diff_summary.

Devuelve JSON EXACTO con esta forma:
{
  "updated_markdown": "<contrato completo en markdown, con cambios aplicados>",
  "diff_summary": "<resumen 3-6 bullets de los cambios>",
  "comments_addressed": [<lista de ids de comentarios que aplicaste>],
  "comments_unresolved": [<ids que no pudiste aplicar>],
  "todos": ["<info faltante que pediste>"]
}`;

interface AiEditResult {
  job_id: string;
  draft_file_id: string;
  diff_summary: string | null;
  todos: string[];
  comments_unresolved: string[];
}

export async function runAiEdit({
  workflowRunId,
  sourceFileId,
  requestedBy,
  requestedById,
  extraPrompt,
}: {
  workflowRunId: string;
  sourceFileId: string;
  requestedBy: string;
  requestedById?: string | null;
  extraPrompt?: string;
}): Promise<AiEditResult> {
  if (!client) {
    throw new Error('ANTHROPIC_API_KEY no seteada en Vercel env vars. Setea la variable y redeploy.');
  }
  const sb = createAdminClient();

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

  const { data: jobRow, error: jobErr } = await sb
    .from('ai_edit_jobs')
    .insert({
      workflow_run_id: workflowRunId,
      source_file_id: sourceFileId,
      requested_by: requestedBy,
      requested_by_id: requestedById ?? null,
      comments_snapshot: pending,
      prompt: extraPrompt ?? null,
      status: 'running',
    })
    .select()
    .single();
  if (jobErr || !jobRow) throw new Error(jobErr?.message ?? 'job insert failed');
  const jobId = (jobRow as any).id;

  try {
    const buffer = await downloadFile((source as any).storage_path);
    const text = await extractText(buffer, (source as any).mime_type);
    if (!text || text.length < 50) {
      throw new Error(`Texto extraído muy corto (${text?.length ?? 0} chars). PDF puede ser imagen sin OCR o .docx sin texto.`);
    }

    const commentsBlock = (pending as any[])
      .map((c, i) => `### Comentario ${i + 1} (id=${c.id}, por ${c.author_email}${c.page_number ? `, p.${c.page_number}` : ''})\n${c.body}`)
      .join('\n\n');

    const userPrompt = `${extraPrompt ? `Instrucción extra del usuario: ${extraPrompt}\n\n---\n\n` : ''}TEXTO DEL CONTRATO ACTUAL:\n\n\`\`\`\n${text.slice(0, 80000)}\n\`\`\`\n\n---\n\nCOMENTARIOS DE LOS APROBADORES (aplicalos):\n\n${commentsBlock}\n\nDevolvé SOLO el JSON, sin texto extra antes ni después.`;

    const r = await client.messages.create({
      model: MODEL,
      max_tokens: 16384,
      temperature: 0.2,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userPrompt }],
    });

    const raw = (r.content ?? [])
      .filter((b: any) => b.type === 'text')
      .map((b: any) => b.text)
      .join('');

    let parsed: any;
    try {
      parsed = JSON.parse(raw);
    } catch {
      const start = raw.indexOf('{');
      const end = raw.lastIndexOf('}');
      if (start >= 0 && end > start) parsed = JSON.parse(raw.slice(start, end + 1));
      else throw new Error(`IA no devolvió JSON. Inicio: "${raw.slice(0, 300)}..."`);
    }
    if (!parsed.updated_markdown) {
      throw new Error('IA devolvió JSON sin updated_markdown. Keys: ' + Object.keys(parsed).join(', '));
    }

    const inputTok = r.usage?.input_tokens ?? 0;
    const outputTok = r.usage?.output_tokens ?? 0;
    const costUsd = inputTok * 0.000003 + outputTok * 0.000015;

    const newPdf = await renderMarkdownToPdf(parsed.updated_markdown);
    const baseName = (source as any).filename.replace(/\.(pdf|docx?|txt)$/i, '');
    const newFilename = `${baseName}_v${((source as any).version ?? 1) + 1}.pdf`;
    const draft = await uploadFileBuffer({
      sb,
      workflowRunId,
      providerId: (source as any).provider_id,
      buffer: newPdf,
      filename: newFilename,
      mimeType: 'application/pdf',
      version: ((source as any).version ?? 1) + 1,
      previousVersionId: (source as any).id,
      uploadedBy: requestedBy + ' (vía IA)',
      uploadedById: requestedById,
    });

    await sb
      .from('ai_edit_jobs')
      .update({
        draft_file_id: draft.id,
        status: 'ready_for_review',
        finished_at: new Date().toISOString(),
        diff_summary: parsed.diff_summary ?? null,
        llm_cost_usd: Number(costUsd.toFixed(4)),
      })
      .eq('id', jobId);

    return {
      job_id: jobId,
      draft_file_id: draft.id,
      diff_summary: parsed.diff_summary ?? null,
      todos: parsed.todos ?? [],
      comments_unresolved: parsed.comments_unresolved ?? [],
    };
  } catch (e: any) {
    await sb
      .from('ai_edit_jobs')
      .update({ status: 'failed', finished_at: new Date().toISOString(), error_message: e.message })
      .eq('id', jobId);
    throw e;
  }
}

async function downloadFile(storagePath: string): Promise<Buffer> {
  const sb = createAdminClient();
  const { data, error } = await sb.storage.from(BUCKET).download(storagePath);
  if (error) throw new Error('storage.download: ' + error.message);
  return Buffer.from(await data.arrayBuffer());
}

async function extractText(buffer: Buffer, mimeType: string): Promise<string> {
  if (mimeType === 'application/pdf') {
    const pdfParse = (await import('pdf-parse/lib/pdf-parse.js' as any)).default;
    const out = await pdfParse(buffer);
    return out.text ?? '';
  }
  return buffer.toString('utf8').slice(0, 200000);
}

async function uploadFileBuffer({
  sb,
  workflowRunId,
  providerId,
  buffer,
  filename,
  mimeType,
  version,
  previousVersionId,
  uploadedBy,
  uploadedById,
}: {
  sb: ReturnType<typeof createAdminClient>;
  workflowRunId: string;
  providerId?: string | null;
  buffer: Buffer;
  filename: string;
  mimeType: string;
  version: number;
  previousVersionId: string;
  uploadedBy: string;
  uploadedById?: string | null;
}): Promise<{ id: string }> {
  const fileId = crypto.randomUUID();
  const storagePath = `${workflowRunId}/${fileId}-${filename.replace(/[^a-zA-Z0-9._-]+/g, '_')}`;
  const up = await sb.storage.from(BUCKET).upload(storagePath, buffer, { contentType: mimeType, upsert: false });
  if (up.error) throw new Error('storage.upload: ' + up.error.message);
  const sha256 = crypto.createHash('sha256').update(buffer).digest('hex');
  const { data, error } = await sb
    .from('contract_files')
    .insert({
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
      draft_status: 'ai_draft',
    })
    .select('id')
    .single();
  if (error) {
    await sb.storage.from(BUCKET).remove([storagePath]).catch(() => {});
    throw new Error(error.message);
  }
  return { id: (data as any).id };
}

async function renderMarkdownToPdf(markdown: string): Promise<Buffer> {
  const { PDFDocument, StandardFonts } = await import('pdf-lib');
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdf.embedFont(StandardFonts.HelveticaBold);

  const pageWidth = 595;
  const pageHeight = 842;
  const margin = 50;
  const maxWidth = pageWidth - margin * 2;
  const lineHeight = 14;

  let page = pdf.addPage([pageWidth, pageHeight]);
  let y = pageHeight - margin;

  function newPage() {
    page = pdf.addPage([pageWidth, pageHeight]);
    y = pageHeight - margin;
  }
  function wrap(text: string, fontObj: any, size: number): string[] {
    const words = text.split(/\s+/);
    const lines: string[] = [];
    let line = '';
    for (const w of words) {
      const trial = line ? line + ' ' + w : w;
      if (fontObj.widthOfTextAtSize(trial, size) <= maxWidth) line = trial;
      else {
        if (line) lines.push(line);
        line = w;
      }
    }
    if (line) lines.push(line);
    return lines;
  }
  function draw(text: string, fontObj: any, size: number, gap = lineHeight) {
    for (const ln of wrap(text, fontObj, size)) {
      if (y < margin + size) newPage();
      page.drawText(ln, { x: margin, y, size, font: fontObj });
      y -= gap;
    }
  }

  for (const raw of markdown.split('\n')) {
    const line = raw.trimEnd();
    if (!line) { y -= 6; continue; }
    if (line.startsWith('# ')) draw(line.slice(2), fontBold, 18, 22);
    else if (line.startsWith('## ')) draw(line.slice(3), fontBold, 14, 18);
    else if (line.startsWith('### ')) draw(line.slice(4), fontBold, 12, 16);
    else draw(line.replace(/[*_`]/g, ''), font, 10, lineHeight);
  }
  const bytes = await pdf.save();
  return Buffer.from(bytes);
}

export async function applyAiDraft(jobId: string, by: string) {
  const sb = createAdminClient();
  const { data: job, error } = await sb.from('ai_edit_jobs').select('*').eq('id', jobId).single();
  if (error || !job) throw new Error('job not found');
  if ((job as any).status !== 'ready_for_review') throw new Error('job no listo (status=' + (job as any).status + ')');
  await sb.from('contract_files').update({ archived_at: new Date().toISOString(), draft_status: 'superseded' }).eq('id', (job as any).source_file_id);
  await sb.from('contract_files').update({ draft_status: 'active' }).eq('id', (job as any).draft_file_id);
  await sb.from('file_comments').update({ resolved: true }).eq('file_id', (job as any).source_file_id).eq('resolved', false);
  await sb.from('ai_edit_jobs').update({ status: 'applied' }).eq('id', jobId);
  return { ok: true };
}

export async function discardAiDraft(jobId: string) {
  const sb = createAdminClient();
  const { data: job } = await sb.from('ai_edit_jobs').select('*').eq('id', jobId).single();
  if (!job) throw new Error('job not found');
  const draftId = (job as any).draft_file_id;
  if (draftId) {
    const { data: draft } = await sb.from('contract_files').select('storage_path').eq('id', draftId).single();
    const sp = (draft as any)?.storage_path;
    if (sp) await sb.storage.from(BUCKET).remove([sp]).catch(() => {});
    await sb.from('contract_files').delete().eq('id', draftId);
  }
  await sb.from('ai_edit_jobs').update({ status: 'discarded' }).eq('id', jobId);
  return { ok: true };
}
