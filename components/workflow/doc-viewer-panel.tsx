'use client';

import { useState, useEffect, useTransition, useMemo } from 'react';
import type { ContractFile, FileComment } from '@/lib/types';
import { addComment, resolveComment, unresolveComment, applyAiEditAction } from '@/app/(admin)/admin/workflows/[id]/actions';

interface Props {
  workflowRunId: string;
  files: ContractFile[];
  commentsByFile: Record<string, FileComment[]>;
  canRunAi: boolean;
}

export function DocViewerPanel({ workflowRunId, files, commentsByFile, canRunAi }: Props) {
  const [activeId, setActiveId] = useState<string | null>(files[0]?.id ?? null);
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const [loadingUrl, setLoadingUrl] = useState(false);
  const [draft, setDraft] = useState('');
  const [pending, startTransition] = useTransition();
  const [aiOpen, setAiOpen] = useState(false);
  const [aiPrompt, setAiPrompt] = useState('');
  const [aiResult, setAiResult] = useState<{ diff: string | null; todos: string[]; jobId: string } | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const activeFile = useMemo(() => files.find((f) => f.id === activeId) ?? null, [files, activeId]);
  const comments = activeId ? commentsByFile[activeId] ?? [] : [];
  const pendingCount = comments.filter((c) => !c.resolved).length;

  useEffect(() => {
    if (!activeFile) { setSignedUrl(null); return; }
    setLoadingUrl(true);
    setSignedUrl(null);
    fetch(`/api/files/url?id=${activeFile.id}`)
      .then((r) => r.json())
      .then((d) => { if (d.url) setSignedUrl(d.url); else setError(d.error ?? 'No URL'); })
      .catch((e) => setError(e.message))
      .finally(() => setLoadingUrl(false));
  }, [activeFile]);

  function submitComment() {
    if (!draft.trim() || !activeId) return;
    setError(null);
    startTransition(async () => {
      try {
        await addComment({ fileId: activeId, workflowRunId, body: draft });
        setDraft('');
      } catch (e: any) { setError(e.message); }
    });
  }

  function onResolve(id: string) {
    startTransition(async () => {
      try { await resolveComment(id, workflowRunId); } catch (e: any) { setError(e.message); }
    });
  }

  function onUnresolve(id: string) {
    startTransition(async () => {
      try { await unresolveComment(id, workflowRunId); } catch (e: any) { setError(e.message); }
    });
  }

  function runAi() {
    if (!activeId) return;
    setAiError(null);
    setAiResult(null);
    startTransition(async () => {
      try {
        const r = await applyAiEditAction({ workflowRunId, sourceFileId: activeId, extraPrompt: aiPrompt || undefined });
        setAiResult({ diff: r.diff_summary, todos: r.todos, jobId: r.job_id });
      } catch (e: any) { setAiError(e.message); }
    });
  }

  if (!files.length) {
    return (
      <div className="card text-center py-8">
        <p className="text-muted text-sm">No hay documentos del contrato todavía.</p>
        <p className="text-muted text-xs mt-1">Espera a que el proveedor complete su perfil o sube uno desde admin.</p>
      </div>
    );
  }

  return (
    <div className="card p-0 overflow-hidden">
      <div className="grid grid-cols-[1fr,360px] min-h-[600px]">
        <div className="border-r border-border flex flex-col">
          <div className="flex items-center gap-2 p-3 border-b border-border bg-brand-50/50">
            <select className="input flex-1" value={activeId ?? ''} onChange={(e) => setActiveId(e.target.value)}>
              {files.map((f) => (
                <option key={f.id} value={f.id}>
                  v{f.version} · {f.filename}
                  {f.draft_status === 'ai_draft' ? ' (borrador IA)' : ''}
                </option>
              ))}
            </select>
            {canRunAi && activeFile && (
              <button className="btn-primary text-xs whitespace-nowrap" onClick={() => setAiOpen(true)} disabled={pending}>
                🪄 Aplicar IA ({pendingCount})
              </button>
            )}
          </div>
          <div className="flex-1 bg-gray-100 relative">
            {loadingUrl && <div className="absolute inset-0 grid place-items-center text-muted text-sm">Cargando…</div>}
            {signedUrl && activeFile?.mime_type === 'application/pdf' && (
              <iframe src={signedUrl} className="w-full h-full min-h-[600px]" title={activeFile.filename} />
            )}
            {signedUrl && activeFile && activeFile.mime_type !== 'application/pdf' && (
              <div className="p-6 text-center">
                <p className="text-muted text-sm mb-3">Preview no soportado para {activeFile.mime_type}.</p>
                <a href={signedUrl} className="btn-primary" download>Descargar archivo</a>
              </div>
            )}
          </div>
        </div>

        <div className="flex flex-col">
          <div className="p-3 border-b border-border bg-brand-50/50">
            <h4 className="font-semibold text-sm">Comentarios</h4>
            <p className="text-xs text-muted mt-0.5">{pendingCount} pendientes · {comments.length - pendingCount} resueltos</p>
          </div>
          <div className="flex-1 overflow-y-auto p-3 space-y-2.5">
            {comments.length === 0 && <p className="text-xs text-muted text-center py-6">Sin comentarios. Sé el primero.</p>}
            {comments.map((c) => (
              <div key={c.id} className={`rounded-lg p-2.5 text-sm border ${c.resolved ? 'bg-gray-50 border-gray-200 opacity-70' : 'bg-white border-border'}`}>
                <div className="flex items-center justify-between gap-2 mb-1">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="text-[10px] uppercase tracking-wider font-semibold text-brand-700 truncate">{c.author_display_name ?? c.author_email}</span>
                  </div>
                  {!c.resolved && (
                    <button className="text-[10px] text-emerald-600 hover:underline" onClick={() => onResolve(c.id)} disabled={pending}>
                      ✓ resolver
                    </button>
                  )}
                  {c.resolved && (
                    <button className="text-[10px] text-emerald-700 hover:underline" onClick={() => onUnresolve(c.id)} disabled={pending} title="Reabrir comentario">
                      ✓ resuelto · reabrir
                    </button>
                  )}
                </div>
                <p className="whitespace-pre-wrap break-words text-[13px] leading-snug">{c.body}</p>
                <div className="text-[10px] text-muted mt-1.5">{new Date(c.created_at).toLocaleString('es', { dateStyle: 'short', timeStyle: 'short' })}</div>
              </div>
            ))}
          </div>
          <div className="p-3 border-t border-border space-y-2">
            <textarea
              className="input min-h-[60px] text-sm resize-y"
              placeholder="Agregar comentario… (usa @email para mencionar)"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
            />
            <button className="btn-primary w-full" onClick={submitComment} disabled={pending || !draft.trim()}>
              {pending ? 'Enviando…' : 'Comentar'}
            </button>
            {error && <div className="text-xs text-danger">{error}</div>}
          </div>
        </div>
      </div>

      {aiOpen && (
        <div className="fixed inset-0 z-50 bg-black/40 grid place-items-center p-4" onClick={(e) => { if (e.target === e.currentTarget) setAiOpen(false); }}>
          <div className="bg-white rounded-2xl max-w-lg w-full p-5 space-y-3">
            <h3 className="font-display font-bold text-lg">🪄 Aplicar IA al contrato</h3>
            {!aiResult ? (
              <>
                <p className="text-sm text-muted">
                  Claude va a leer el contrato (<strong>{activeFile?.filename}</strong>) y aplicar los <strong>{pendingCount} comentarios pendientes</strong>.
                  Genera una versión nueva (v{(activeFile?.version ?? 1) + 1}) que podés revisar y aplicar o descartar.
                </p>
                <div>
                  <label className="label">Instrucción extra (opcional)</label>
                  <textarea
                    className="input min-h-[60px] text-sm"
                    placeholder="Ej: además sé más conservador con cláusula de penalidades"
                    value={aiPrompt}
                    onChange={(e) => setAiPrompt(e.target.value)}
                  />
                </div>
                {aiError && <div className="bg-red-50 text-danger text-sm p-2.5 rounded-lg border border-red-200">{aiError}</div>}
                <div className="flex gap-2 justify-end pt-2">
                  <button className="btn-ghost" onClick={() => setAiOpen(false)}>Cancelar</button>
                  <button className="btn-primary" onClick={runAi} disabled={pending || pendingCount === 0}>
                    {pending ? 'Procesando…' : 'Correr Claude'}
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 text-sm">
                  <div className="font-semibold text-emerald-800 mb-1">✓ Borrador generado</div>
                  {aiResult.diff && <div className="text-emerald-700 whitespace-pre-wrap text-xs">{aiResult.diff}</div>}
                </div>
                {aiResult.todos.length > 0 && (
                  <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm">
                    <div className="font-semibold text-amber-800 mb-1">⚠ TODOs</div>
                    <ul className="text-amber-700 text-xs list-disc pl-4 space-y-1">
                      {aiResult.todos.map((t, i) => <li key={i}>{t}</li>)}
                    </ul>
                  </div>
                )}
                <p className="text-xs text-muted">Recarga la página para ver la versión nueva en el selector.</p>
                <div className="flex gap-2 justify-end">
                  <button className="btn-primary" onClick={() => { setAiOpen(false); window.location.reload(); }}>Listo, recargar</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
