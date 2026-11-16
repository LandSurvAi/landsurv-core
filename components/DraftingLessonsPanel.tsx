import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';

type RagApi = <T>(path: string, init?: RequestInit & { timeoutMs?: number }) => Promise<T>;

interface DraftingLessonsPanelProps {
  api: RagApi;
  apiBase: string;
  sessionToken: string;
}

type LessonStatus = 'draft' | 'approved' | 'retired';

interface DraftingLesson {
  id: string;
  status: LessonStatus;
  audience: string;
  task: string;
  title: string;
  intent: string;
  rules: string[];
  correct_examples: string[];
  anti_examples: string[];
  field_codes: string[];
  notes: string;
  image_uri: string | null;
  image_sha256: string | null;
  image_mime: string | null;
  extraction_model: string | null;
  extraction_warning: string | null;
  created_by: string | null;
  approved_by: string | null;
  revision: number;
  chunk_count: number;
  created_at: string;
  updated_at: string;
  approved_at: string | null;
  retired_at: string | null;
  has_image: boolean;
}

interface LessonCounts {
  draft: number;
  approved: number;
  retired: number;
}

interface TrainingCounts {
  train: number;
  validation: number;
  test: number;
  total: number;
}

interface LessonsResponse {
  lessons: DraftingLesson[];
  counts: LessonCounts;
  training: TrainingCounts;
}

interface CreateResponse {
  lesson: DraftingLesson;
  extraction_warning: string | null;
}

interface DraftForm {
  title: string;
  task: string;
  intent: string;
  rules: string;
  correct_examples: string;
  anti_examples: string;
  field_codes: string;
  notes: string;
}

const EMPTY_FORM: DraftForm = {
  title: '',
  task: 'drafting.general',
  intent: '',
  rules: '',
  correct_examples: '',
  anti_examples: '',
  field_codes: '',
  notes: '',
};

function lessonToForm(lesson: DraftingLesson): DraftForm {
  return {
    title: lesson.title,
    task: lesson.task,
    intent: lesson.intent,
    rules: lesson.rules.join('\n'),
    correct_examples: lesson.correct_examples.join('\n'),
    anti_examples: lesson.anti_examples.join('\n'),
    field_codes: lesson.field_codes.join('\n'),
    notes: lesson.notes,
  };
}

export function parseLessonLines(value: string): string[] {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim().replace(/^[-*•]\s*/, ''))
    .filter(Boolean);
}

function formatDate(value: string | null | undefined): string {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function statusTone(status: LessonStatus): string {
  if (status === 'approved') return 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300';
  if (status === 'retired') return 'border-slate-600 bg-slate-800 text-slate-400';
  return 'border-amber-500/40 bg-amber-500/10 text-amber-200';
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('The image could not be read.'));
    reader.readAsDataURL(file);
  });
}

function LessonImage({
  lessonId,
  apiBase,
  sessionToken,
}: {
  lessonId: string;
  apiBase: string;
  sessionToken: string;
}) {
  const [url, setUrl] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    let objectUrl = '';
    setUrl('');
    setError('');
    fetch(`${apiBase}/api/rag/lessons/${encodeURIComponent(lessonId)}/image`, {
      headers: { Authorization: `Bearer ${sessionToken}` },
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error(`Image unavailable (HTTP ${response.status})`);
        const blob = await response.blob();
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
      })
      .catch((caught) => {
        if (caught instanceof DOMException && caught.name === 'AbortError') return;
        setError(caught instanceof Error ? caught.message : 'Image unavailable');
      });
    return () => {
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [apiBase, lessonId, sessionToken]);

  if (error) {
    return <div className="border border-red-500/30 bg-red-500/5 p-3 text-xs text-red-200">{error}</div>;
  }
  if (!url) {
    return <div className="h-36 animate-pulse border border-slate-700 bg-slate-900" />;
  }
  return (
    <a href={url} target="_blank" rel="noreferrer noopener" className="block overflow-hidden border border-slate-700 bg-slate-950">
      <img src={url} alt="Annotated lesson evidence" className="max-h-72 w-full object-contain" />
    </a>
  );
}

export default function DraftingLessonsPanel({
  api,
  apiBase,
  sessionToken,
}: DraftingLessonsPanelProps) {
  const [data, setData] = useState<LessonsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedId, setSelectedId] = useState<string>('');
  const [form, setForm] = useState<DraftForm>(EMPTY_FORM);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState('');
  const [createNotes, setCreateNotes] = useState('');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState('');
  const [saving, setSaving] = useState(false);
  const [approving, setApproving] = useState(false);
  const [retiring, setRetiring] = useState(false);
  const [actionMessage, setActionMessage] = useState('');
  const [actionError, setActionError] = useState('');
  const [exportSplit, setExportSplit] = useState('train');
  const [exporting, setExporting] = useState(false);
  const [exportMessage, setExportMessage] = useState('');
  const imageInputRef = useRef<HTMLInputElement | null>(null);

  const lessons = data?.lessons ?? [];
  const selected = useMemo(
    () => lessons.find((lesson) => lesson.id === selectedId) ?? null,
    [lessons, selectedId],
  );

  const loadLessons = useCallback(async (preferredId?: string) => {
    try {
      const response = await api<LessonsResponse>('/api/rag/lessons?limit=100');
      setData(response);
      setSelectedId((current) => {
        const next = preferredId || current;
        if (next && response.lessons.some((lesson) => lesson.id === next)) return next;
        return response.lessons[0]?.id || '';
      });
      setError('');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Drafting lessons could not be loaded.');
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    void loadLessons();
  }, [loadLessons]);

  useEffect(() => {
    if (selected) {
      setForm(lessonToForm(selected));
      setActionMessage('');
      setActionError('');
    } else {
      setForm(EMPTY_FORM);
    }
    // Refill only when a different lesson is selected. Saving/approving the
    // same lesson must not wipe the user's in-progress edits or status message.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.id]);

  useEffect(() => {
    if (!imageFile) {
      setImagePreview('');
      return;
    }
    const url = URL.createObjectURL(imageFile);
    setImagePreview(url);
    return () => URL.revokeObjectURL(url);
  }, [imageFile]);

  const updateForm = (key: keyof DraftForm, value: string) => {
    setForm((current) => ({ ...current, [key]: value }));
    setActionMessage('');
    setActionError('');
  };

  const createLesson = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!imageFile || creating) return;
    if (imageFile.size > 12 * 1024 * 1024) {
      setCreateError('Image must be 12 MB or smaller.');
      return;
    }
    setCreating(true);
    setCreateError('');
    setActionMessage('');
    try {
      const dataUrl = await readFileAsDataUrl(imageFile);
      const base64 = dataUrl.split(',', 2)[1] || '';
      const response = await api<CreateResponse>('/api/rag/lessons', {
        method: 'POST',
        timeoutMs: 120_000,
        body: JSON.stringify({
          image_base64: base64,
          image_mime_type: imageFile.type,
          ...(createNotes.trim() ? { notes: createNotes.trim() } : {}),
        }),
      });
      setImageFile(null);
      setCreateNotes('');
      if (imageInputRef.current) imageInputRef.current.value = '';
      await loadLessons(response.lesson.id);
      setActionMessage(
        response.extraction_warning
          ? `Draft saved. Vision extraction needs attention: ${response.extraction_warning}`
          : 'Draft created. Review every field before approval.',
      );
    } catch (caught) {
      setCreateError(caught instanceof Error ? caught.message : 'The lesson could not be created.');
    } finally {
      setCreating(false);
    }
  };

  const buildPayload = () => ({
    title: form.title.trim(),
    task: form.task.trim() || 'drafting.general',
    intent: form.intent.trim(),
    rules: parseLessonLines(form.rules),
    correct_examples: parseLessonLines(form.correct_examples),
    anti_examples: parseLessonLines(form.anti_examples),
    field_codes: parseLessonLines(form.field_codes),
    notes: form.notes.trim(),
  });

  const saveLesson = useCallback(async (): Promise<DraftingLesson | null> => {
    if (!selected) return null;
    if (!form.title.trim()) {
      setActionError('A title is required.');
      return null;
    }
    setSaving(true);
    setActionError('');
    setActionMessage('');
    try {
      const response = await api<{ lesson: DraftingLesson }>(
        `/api/rag/lessons/${encodeURIComponent(selected.id)}`,
        { method: 'PATCH', body: JSON.stringify(buildPayload()) },
      );
      setData((current) => current ? {
        ...current,
        lessons: current.lessons.map((lesson) => lesson.id === response.lesson.id ? response.lesson : lesson),
      } : current);
      setActionMessage('Draft saved. Approval is required before it can be retrieved.');
      return response.lesson;
    } catch (caught) {
      setActionError(caught instanceof Error ? caught.message : 'The lesson could not be saved.');
      return null;
    } finally {
      setSaving(false);
    }
  }, [api, form, selected]);

  const approveLesson = async () => {
    if (!selected || approving) return;
    if (!parseLessonLines(form.rules).length) {
      setActionError('Add at least one rule before approval.');
      return;
    }
    const saved = await saveLesson();
    if (!saved) return;
    setApproving(true);
    setActionError('');
    try {
      const response = await api<{ lesson: DraftingLesson }>(
        `/api/rag/lessons/${encodeURIComponent(saved.id)}/approve`,
        { method: 'POST', body: JSON.stringify({}) },
      );
      await loadLessons(response.lesson.id);
      setActionMessage(
        `Approved revision ${response.lesson.revision}. It is now retrievable and captured in the versioned training dataset.`,
      );
    } catch (caught) {
      setActionError(caught instanceof Error ? caught.message : 'The lesson could not be approved.');
    } finally {
      setApproving(false);
    }
  };

  const retireLesson = async () => {
    if (!selected || retiring) return;
    if (!window.confirm('Retire this lesson? It will be removed from retrieval and future training exports, but its audit history stays.')) {
      return;
    }
    setRetiring(true);
    setActionError('');
    try {
      const response = await api<{ lesson: DraftingLesson }>(
        `/api/rag/lessons/${encodeURIComponent(selected.id)}/retire`,
        { method: 'POST', body: JSON.stringify({}) },
      );
      await loadLessons(response.lesson.id);
      setActionMessage('Lesson retired. Its old training revisions remain auditable but are excluded from exports.');
    } catch (caught) {
      setActionError(caught instanceof Error ? caught.message : 'The lesson could not be retired.');
    } finally {
      setRetiring(false);
    }
  };

  const exportTraining = async () => {
    if (exporting) return;
    setExporting(true);
    setExportMessage('');
    setActionError('');
    try {
      const response = await fetch(
        `${apiBase}/api/rag/training/export?format=jsonl&split=${encodeURIComponent(exportSplit)}`,
        { headers: { Authorization: `Bearer ${sessionToken}` } },
      );
      if (!response.ok) {
        let message = `Export failed with HTTP ${response.status}`;
        try {
          const payload = await response.json() as { error?: string };
          if (payload?.error) message = payload.error;
        } catch { /* keep status message */ }
        throw new Error(message);
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `landsurv-drafting-${exportSplit}-${new Date().toISOString().slice(0, 10)}.jsonl`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
      setExportMessage(`Downloaded ${response.headers.get('X-Dataset-Count') || 'the'} reviewed example(s).`);
    } catch (caught) {
      setActionError(caught instanceof Error ? caught.message : 'The training export failed.');
    } finally {
      setExporting(false);
    }
  };

  return (
    <section className="space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-4 border border-cyan-500/25 bg-gradient-to-br from-cyan-500/[0.08] via-slate-900 to-slate-900 p-5">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-cyan-300">Drafting lessons</p>
          <h2 className="mt-1 text-lg font-semibold text-white">Capture corrections. Review them. Teach the drafter.</h2>
          <p className="mt-1 max-w-3xl text-xs leading-5 text-slate-400">
            Each upload becomes a private vision-assisted draft. Only an approved lesson is embedded for Civil Drafter.
            Approval also freezes an immutable preference example for long-term training and evaluation.
          </p>
        </div>
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="border border-slate-700 bg-slate-950/50 px-3 py-2">
            <p className="text-lg font-semibold text-white">{data?.counts.approved ?? 0}</p>
            <p className="text-[9px] uppercase tracking-wide text-slate-500">Approved</p>
          </div>
          <div className="border border-slate-700 bg-slate-950/50 px-3 py-2">
            <p className="text-lg font-semibold text-white">{data?.counts.draft ?? 0}</p>
            <p className="text-[9px] uppercase tracking-wide text-slate-500">Drafts</p>
          </div>
          <div className="border border-slate-700 bg-slate-950/50 px-3 py-2">
            <p className="text-lg font-semibold text-white">{data?.training.total ?? 0}</p>
            <p className="text-[9px] uppercase tracking-wide text-slate-500">Train rows</p>
          </div>
        </div>
      </header>

      {error && (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-3 border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          <span>{error}</span>
          <button type="button" onClick={() => void loadLessons()} className="border border-red-400/40 px-2 py-1 text-xs font-semibold hover:bg-red-500/10">
            Retry
          </button>
        </div>
      )}

      <section className="border border-slate-700 bg-slate-800 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="font-semibold text-white">Capture a markup correction</h3>
            <p className="mt-1 max-w-3xl text-xs leading-5 text-slate-400">
              Upload the annotated screenshot. The image is stored privately and passed to Gemini vision once; it is not
              embedded. State the colour legend and what the AI got wrong in the notes.
            </p>
          </div>
          <span className="border border-cyan-500/30 bg-cyan-500/10 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-cyan-200">
            private evidence
          </span>
        </div>
        <form onSubmit={(event) => void createLesson(event)} className="mt-4 grid gap-4 lg:grid-cols-[0.8fr_1.2fr]">
          <div className="space-y-3">
            <label className="block text-xs font-semibold text-slate-300">
              Annotated image
              <input
                ref={imageInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                onChange={(event) => {
                  setImageFile(event.target.files?.[0] ?? null);
                  setCreateError('');
                }}
                className="mt-1 block w-full cursor-pointer border border-slate-600 bg-slate-950/70 px-3 py-2 text-xs text-slate-300 file:mr-3 file:border-0 file:bg-cyan-500/15 file:px-2 file:py-1 file:text-cyan-200"
              />
            </label>
            {imagePreview ? (
              <img src={imagePreview} alt="Selected markup preview" className="max-h-48 w-full border border-slate-700 bg-slate-950 object-contain" />
            ) : (
              <div className="flex h-28 items-center justify-center border border-dashed border-slate-700 bg-slate-950/40 text-xs text-slate-600">
                PNG, JPEG or WebP · max 12 MB
              </div>
            )}
          </div>
          <div className="space-y-3">
            <label className="block text-xs font-semibold text-slate-300">
              Operator notes / colour legend
              <textarea
                value={createNotes}
                onChange={(event) => setCreateNotes(event.target.value.slice(0, 4000))}
                rows={5}
                placeholder="Yellow = correction, pink = prior AI attempt, red X = bad crossing. Breakline chains must never cross; follow continuous top and bottom sets."
                className="mt-1 w-full border border-slate-600 bg-slate-950/70 px-3 py-2 text-xs leading-5 text-white placeholder:text-slate-600 focus:border-cyan-400/60 focus:outline-none"
              />
            </label>
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="submit"
                disabled={!imageFile || creating}
                className="bg-cyan-400 px-4 py-2 text-xs font-bold text-slate-950 hover:bg-cyan-300 disabled:opacity-50"
              >
                {creating ? 'Extracting lesson…' : 'Create reviewed draft'}
              </button>
              <span className="text-[11px] text-slate-500">Vision output is a draft; nothing is retrievable until you approve it.</span>
            </div>
            {createError && <p role="alert" className="text-xs text-red-300">{createError}</p>}
          </div>
        </form>
      </section>

      <div className="grid gap-5 xl:grid-cols-[0.72fr_1.28fr]">
        <section className="border border-slate-700 bg-slate-800">
          <div className="flex items-center justify-between border-b border-slate-700 px-4 py-3">
            <div>
              <h3 className="font-semibold text-white">Review queue</h3>
              <p className="mt-0.5 text-[11px] text-slate-500">{loading ? 'Loading…' : `${lessons.length} lesson(s)`}</p>
            </div>
            <button type="button" onClick={() => void loadLessons()} className="text-xs font-semibold text-cyan-300 hover:underline">
              Refresh
            </button>
          </div>
          <div className="max-h-[38rem] overflow-y-auto">
            {lessons.length === 0 && !loading ? (
              <p className="p-6 text-sm text-slate-500">No lessons yet. Capture the first markup above.</p>
            ) : (
              <ul className="divide-y divide-slate-800">
                {lessons.map((lesson) => (
                  <li key={lesson.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedId(lesson.id)}
                      className={`w-full px-4 py-3 text-left transition-colors hover:bg-slate-700/40 ${
                        selectedId === lesson.id ? 'bg-cyan-500/[0.07]' : ''
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <p className="line-clamp-2 text-sm font-semibold text-slate-100">{lesson.title}</p>
                        <span className={`shrink-0 border px-1.5 py-0.5 text-[9px] font-bold uppercase ${statusTone(lesson.status)}`}>
                          {lesson.status}
                        </span>
                      </div>
                      <p className="mt-1 text-[11px] text-slate-500">
                        {lesson.task} · rev {lesson.revision} · {lesson.rules.length} rule(s)
                        {lesson.has_image ? ' · image' : ''}
                      </p>
                      <p className="mt-1 text-[10px] text-slate-600">Updated {formatDate(lesson.updated_at)}</p>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>

        <section className="border border-slate-700 bg-slate-800">
          {!selected ? (
            <div className="p-8 text-sm text-slate-500">Select a lesson to review its evidence and approval fields.</div>
          ) : (
            <div className="space-y-4 p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-cyan-300">Review & approve</p>
                  <h3 className="mt-1 text-base font-semibold text-white">{selected.title}</h3>
                  <p className="mt-1 text-[11px] text-slate-500">
                    {selected.id} · {selected.status} · revision {selected.revision}
                    {selected.approved_by ? ` · approved by ${selected.approved_by}` : ''}
                  </p>
                </div>
                {selected.has_image && (
                  <span className="border border-slate-600 bg-slate-900 px-2 py-1 text-[10px] text-slate-400">private image attached</span>
                )}
              </div>

              {selected.has_image && (
                <LessonImage lessonId={selected.id} apiBase={apiBase} sessionToken={sessionToken} />
              )}

              {selected.extraction_warning && (
                <div className="border border-amber-500/30 bg-amber-500/[0.06] px-3 py-2 text-xs text-amber-200">
                  Vision warning: {selected.extraction_warning}. Edit the fields manually before approval.
                </div>
              )}

              <div className="grid gap-3 sm:grid-cols-2">
                <label className="text-xs font-semibold text-slate-300 sm:col-span-2">
                  Title
                  <input
                    value={form.title}
                    onChange={(event) => updateForm('title', event.target.value)}
                    maxLength={160}
                    className="mt-1 w-full border border-slate-600 bg-slate-950/70 px-3 py-2 text-sm text-white focus:border-cyan-400/60 focus:outline-none"
                  />
                </label>
                <label className="text-xs font-semibold text-slate-300">
                  Task key
                  <input
                    value={form.task}
                    onChange={(event) => updateForm('task', event.target.value)}
                    placeholder="drafting.breaklines"
                    className="mt-1 w-full border border-slate-600 bg-slate-950/70 px-3 py-2 text-xs text-white placeholder:text-slate-600 focus:border-cyan-400/60 focus:outline-none"
                  />
                </label>
                <label className="text-xs font-semibold text-slate-300">
                  Field evidence
                  <input
                    value={form.field_codes}
                    onChange={(event) => updateForm('field_codes', event.target.value)}
                    placeholder="TB, BB, TST1 (one per line)"
                    className="mt-1 w-full border border-slate-600 bg-slate-950/70 px-3 py-2 text-xs text-white placeholder:text-slate-600 focus:border-cyan-400/60 focus:outline-none"
                  />
                </label>
                <label className="text-xs font-semibold text-slate-300 sm:col-span-2">
                  When this applies
                  <textarea
                    value={form.intent}
                    onChange={(event) => updateForm('intent', event.target.value)}
                    rows={2}
                    className="mt-1 w-full border border-slate-600 bg-slate-950/70 px-3 py-2 text-xs leading-5 text-white focus:border-cyan-400/60 focus:outline-none"
                  />
                </label>
                <label className="text-xs font-semibold text-slate-300">
                  Rules · one per line
                  <textarea
                    value={form.rules}
                    onChange={(event) => updateForm('rules', event.target.value)}
                    rows={6}
                    className="mt-1 w-full border border-slate-600 bg-slate-950/70 px-3 py-2 text-xs leading-5 text-white focus:border-cyan-400/60 focus:outline-none"
                  />
                </label>
                <label className="text-xs font-semibold text-slate-300">
                  Correct examples · one per line
                  <textarea
                    value={form.correct_examples}
                    onChange={(event) => updateForm('correct_examples', event.target.value)}
                    rows={6}
                    className="mt-1 w-full border border-slate-600 bg-slate-950/70 px-3 py-2 text-xs leading-5 text-white focus:border-cyan-400/60 focus:outline-none"
                  />
                </label>
                <label className="text-xs font-semibold text-slate-300">
                  Rejected examples · one per line
                  <textarea
                    value={form.anti_examples}
                    onChange={(event) => updateForm('anti_examples', event.target.value)}
                    rows={4}
                    className="mt-1 w-full border border-slate-600 bg-slate-950/70 px-3 py-2 text-xs leading-5 text-white focus:border-cyan-400/60 focus:outline-none"
                  />
                </label>
                <label className="text-xs font-semibold text-slate-300">
                  Operator notes
                  <textarea
                    value={form.notes}
                    onChange={(event) => updateForm('notes', event.target.value)}
                    rows={4}
                    className="mt-1 w-full border border-slate-600 bg-slate-950/70 px-3 py-2 text-xs leading-5 text-white focus:border-cyan-400/60 focus:outline-none"
                  />
                </label>
              </div>

              {actionError && <div role="alert" className="border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-200">{actionError}</div>}
              {actionMessage && <div className="border border-cyan-500/30 bg-cyan-500/[0.06] px-3 py-2 text-xs text-cyan-200">{actionMessage}</div>}

              <div className="flex flex-wrap items-center gap-2 border-t border-slate-700 pt-4">
                <button
                  type="button"
                  onClick={() => void saveLesson()}
                  disabled={saving || approving}
                  className="border border-slate-500 px-3 py-2 text-xs font-semibold text-slate-200 hover:bg-slate-700 disabled:opacity-50"
                >
                  {saving ? 'Saving…' : 'Save draft'}
                </button>
                <button
                  type="button"
                  onClick={() => void approveLesson()}
                  disabled={approving || saving || selected.status === 'retired'}
                  className="bg-cyan-400 px-3 py-2 text-xs font-bold text-slate-950 hover:bg-cyan-300 disabled:opacity-50"
                >
                  {approving ? 'Approving…' : selected.status === 'approved' ? 'Re-approve revision' : 'Approve for Civil Drafter'}
                </button>
                {selected.status !== 'retired' && (
                  <button
                    type="button"
                    onClick={() => void retireLesson()}
                    disabled={retiring}
                    className="ml-auto border border-red-500/40 px-3 py-2 text-xs font-semibold text-red-200 hover:bg-red-500/10 disabled:opacity-50"
                  >
                    {retiring ? 'Retiring…' : 'Retire'}
                  </button>
                )}
              </div>
              <p className="text-[11px] leading-5 text-slate-500">
                Editing an approved lesson removes it from retrieval and the live training export until you approve a new
                revision. Old revisions remain in the audit table.
              </p>
            </div>
          )}
        </section>
      </div>

      <section className="border border-slate-700 bg-slate-800 p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-cyan-300">Long-term training dataset</p>
            <h3 className="mt-1 font-semibold text-white">Versioned preference exports</h3>
            <p className="mt-1 max-w-3xl text-xs leading-5 text-slate-400">
              Every approval creates a frozen <span className="font-mono">chosen / rejected</span> JSONL row with its task,
              prompt, provenance and private image reference. The split is deterministic (80% train, 10% validation, 10% test),
              so repeated exports do not leak the same lesson across splits.
            </p>
            <div className="mt-3 flex flex-wrap gap-2 text-[10px] font-semibold uppercase tracking-wide">
              <span className="border border-slate-600 bg-slate-900 px-2 py-1 text-slate-300">train {data?.training.train ?? 0}</span>
              <span className="border border-slate-600 bg-slate-900 px-2 py-1 text-slate-300">validation {data?.training.validation ?? 0}</span>
              <span className="border border-slate-600 bg-slate-900 px-2 py-1 text-slate-300">test {data?.training.test ?? 0}</span>
            </div>
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <label className="text-xs text-slate-400">
              Split
              <select
                value={exportSplit}
                onChange={(event) => setExportSplit(event.target.value)}
                className="mt-1 block border border-slate-600 bg-slate-900 px-2 py-2 text-xs text-slate-200"
              >
                <option value="train">Train</option>
                <option value="validation">Validation</option>
                <option value="test">Test</option>
              </select>
            </label>
            <button
              type="button"
              onClick={() => void exportTraining()}
              disabled={exporting}
              className="border border-cyan-500/40 bg-cyan-500/10 px-3 py-2 text-xs font-semibold text-cyan-200 hover:bg-cyan-500/20 disabled:opacity-50"
            >
              {exporting ? 'Exporting…' : 'Export JSONL'}
            </button>
          </div>
        </div>
        {exportMessage && <p className="mt-3 border border-emerald-500/30 bg-emerald-500/[0.06] px-3 py-2 text-xs text-emerald-200">{exportMessage}</p>}
        <p className="mt-3 text-[11px] leading-5 text-slate-500">
          Export is the handoff to an offline trainer. It does not fine-tune automatically, and it never exposes image bytes
          through the public Civil Drafter endpoint. Use the exported manifest to build SFT or preference training runs, then
          evaluate against the held-out split before changing the production drafter.
        </p>
      </section>
    </section>
  );
}
