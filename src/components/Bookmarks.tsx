import { useEffect, useRef, useState } from "react";
import type { Bookmark } from "../types";
import { formatTime, parseTimestamp } from "../lib/time";

type Draft = { timestampMs: number; title: string; description: string };
type Props = { bookmarks: Bookmark[]; draft: Draft | null; durationMs: number; onCancelDraft: () => void; onSaveDraft: (draft: Draft) => Promise<void>; onJump: (bookmark: Bookmark) => void; onUpdate: (bookmark: Bookmark, patch: Partial<Draft>) => Promise<void>; onDelete: (bookmark: Bookmark) => void; };

export function Bookmarks({ bookmarks, draft, durationMs, onCancelDraft, onSaveDraft, onJump, onUpdate, onDelete }: Props) {
  const [search, setSearch] = useState("");
  const [saving, setSaving] = useState(false);
  const [fullscreen, setFullscreen] = useState(() => Boolean(document.fullscreenElement));
  const titleRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const updateFullscreen = () => setFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", updateFullscreen);
    return () => document.removeEventListener("fullscreenchange", updateFullscreen);
  }, []);
  useEffect(() => { if (draft && !fullscreen && !document.fullscreenElement) titleRef.current?.focus(); }, [draft, fullscreen]);
  const filtered = bookmarks.filter((b) => `${b.title} ${b.description}`.toLocaleLowerCase().includes(search.toLocaleLowerCase()));
  return <aside className="bookmarks" aria-label="Bookmarks">
    <div className="panel-title"><div><h2>Bookmarks</h2><span>{bookmarks.length} saved</span></div></div>
    <label className="search"><span>⌕</span><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search notes" aria-label="Search bookmarks" /></label>
    {draft && <BookmarkEditor draft={draft} titleRef={titleRef} durationMs={durationMs} saving={saving} onCancel={onCancelDraft} onSave={async (next) => { setSaving(true); try { await onSaveDraft(next); } finally { setSaving(false); } }} />}
    <div className="bookmark-list">
      {!draft && bookmarks.length === 0 && <p className="empty-copy">Add a bookmark to capture a moment you want to revisit.</p>}
      {filtered.map((bookmark) => <ExistingBookmark key={bookmark.id} bookmark={bookmark} durationMs={durationMs} onJump={onJump} onUpdate={onUpdate} onDelete={onDelete} />)}
    </div>
  </aside>;
}

function TimestampInput({ milliseconds, max, onValid }: { milliseconds: number; max: number; onValid: (value: number) => void }) {
  const [value, setValue] = useState(formatTime(milliseconds, true));
  const [error, setError] = useState("");
  useEffect(() => setValue(formatTime(milliseconds, true)), [milliseconds]);
  const commit = () => { const parsed = parseTimestamp(value); if (parsed === null || parsed > max) { setError(`Use a time from 0 to ${formatTime(max, true)}`); return; } setError(""); onValid(parsed); };
  return <label className="field time-field">Timestamp<input value={value} onChange={(e) => setValue(e.target.value)} onBlur={commit} onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()} />{error && <em className="field-error">{error}</em>}</label>;
}

function BookmarkEditor({ draft, durationMs, titleRef, saving, onCancel, onSave }: { draft: Draft; durationMs: number; titleRef: React.RefObject<HTMLInputElement | null>; saving: boolean; onCancel: () => void; onSave: (draft: Draft) => Promise<void> }) {
  const [current, setCurrent] = useState(draft); const [error, setError] = useState("");
  useEffect(() => setCurrent(draft), [draft]);
  return <section className="bookmark-editor new-bookmark"><p className="eyebrow">New bookmark · {formatTime(current.timestampMs, true)}</p><label className="field">Title<input ref={titleRef} value={current.title} onChange={(e) => setCurrent({ ...current, title: e.target.value })} /></label><label className="field">Description <small>(optional)</small><textarea value={current.description} onChange={(e) => setCurrent({ ...current, description: e.target.value })} rows={3} /></label><TimestampInput milliseconds={current.timestampMs} max={durationMs} onValid={(timestampMs) => setCurrent({ ...current, timestampMs })} />{error && <p className="inline-error">{error}</p>}<div className="editor-actions"><button className="quiet" onClick={onCancel}>Cancel</button><button className="primary" disabled={saving || !current.title.trim()} onClick={() => onSave({ ...current, title: current.title.trim() }).catch((e: Error) => setError(e.message))}>{saving ? "Saving…" : "Save bookmark"}</button></div></section>;
}

function ExistingBookmark({ bookmark, durationMs, onJump, onUpdate, onDelete }: { bookmark: Bookmark; durationMs: number; onJump: (b: Bookmark) => void; onUpdate: (b: Bookmark, patch: Partial<Draft>) => Promise<void>; onDelete: (b: Bookmark) => void }) {
  const [open, setOpen] = useState(false); const [title, setTitle] = useState(bookmark.title); const [description, setDescription] = useState(bookmark.description); const [status, setStatus] = useState<"saved" | "saving" | "error">("saved"); const timer = useRef<number | undefined>(undefined);
  useEffect(() => { setTitle(bookmark.title); setDescription(bookmark.description); }, [bookmark.title, bookmark.description]);
  const save = (patch: Partial<Draft>, immediately = false) => { window.clearTimeout(timer.current); const perform = () => { setStatus("saving"); void onUpdate(bookmark, patch).then(() => setStatus("saved")).catch(() => setStatus("error")); }; if (immediately) perform(); else timer.current = window.setTimeout(perform, 500); };
  return <article className={`bookmark ${open ? "expanded" : ""}`}><button className="bookmark-jump" onClick={() => onJump(bookmark)}><time>{formatTime(bookmark.timestampMs, true)}</time><span>{bookmark.title}</span></button><button className="disclosure" aria-label={`Edit ${bookmark.title}`} onClick={() => setOpen(!open)}>{open ? "⌃" : "⌄"}</button>{open && <div className="bookmark-details"><label className="field">Title<input value={title} onChange={(e) => { setTitle(e.target.value); save({ title: e.target.value }); }} onBlur={() => save({ title }, true)} /></label><label className="field">Description<textarea rows={3} value={description} onChange={(e) => { setDescription(e.target.value); save({ description: e.target.value }); }} onBlur={() => save({ description }, true)} /></label><TimestampInput milliseconds={bookmark.timestampMs} max={durationMs} onValid={(timestampMs) => save({ timestampMs }, true)} /><div className="bookmark-footer"><span className={`save-state ${status}`}>{status === "saving" ? "Saving…" : status === "error" ? "Save failed" : "Saved"}</span><button className="danger-link" onClick={() => onDelete(bookmark)}>Delete</button></div></div>}</article>;
}
