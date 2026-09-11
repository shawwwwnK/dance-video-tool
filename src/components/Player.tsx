import { useEffect, useId, useRef, useState } from "react";
import type { Bookmark, PlayerState, Video } from "../types";
import { clamp, formatTime, stepFrame } from "../lib/time";

type Draft = { timestampMs: number; title: string; description: string };
type Props = {
  video: Video | null; bookmarks: Bookmark[]; draft: Draft | null; seekStep: number;
  onCancelDraft: () => void; onSaveDraft: (draft: Draft) => Promise<void>;
  onCreateBookmark: (timeMs: number) => void;
  onState: (videoId: string, state: PlayerState) => void;
  onMediaError: (message: string) => void;
};

export function Player({ video, bookmarks, draft, seekStep, onCancelDraft, onSaveDraft, onCreateBookmark, onState, onMediaError }: Props) {
  const media = useRef<HTMLVideoElement>(null);
  const player = useRef<HTMLDivElement>(null);
  const interval = useRef<number | undefined>(undefined);
  const [duration, setDuration] = useState(0);
  const [time, setTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [rate, setRate] = useState(1);
  const [mirrored, setMirrored] = useState(false);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [fullscreen, setFullscreen] = useState(false);
  const [bookmarksOpen, setBookmarksOpen] = useState(false);

  const persist = (overrides: Partial<{ positionMs: number; playbackRate: number; mirrored: boolean; durationMs: number }> = {}) => {
    const element = media.current;
    if (video && element) onState(video.id, { positionMs: Math.round(element.currentTime * 1000), playbackRate: element.playbackRate, mirrored, ...overrides });
  };
  useEffect(() => {
    setReady(false); setError(""); setDuration(0); setTime(0); setPlaying(false);
    setRate(video?.playbackRate ?? 1); setMirrored(video?.mirrored ?? false);
  }, [video?.id]);
  useEffect(() => () => { window.clearInterval(interval.current); media.current?.pause(); }, []);
  useEffect(() => {
    const updateFullscreen = () => { const active = document.fullscreenElement === player.current; setFullscreen(active); if (!active) setBookmarksOpen(false); };
    document.addEventListener("fullscreenchange", updateFullscreen);
    return () => document.removeEventListener("fullscreenchange", updateFullscreen);
  }, []);
  useEffect(() => { if (fullscreen && draft) setBookmarksOpen(true); }, [draft, fullscreen]);
  useEffect(() => () => {
    const element = media.current;
    if (element && video) {
      onState(video.id, { positionMs: Math.round(element.currentTime * 1000), playbackRate: element.playbackRate, mirrored, durationMs: Number.isFinite(element.duration) ? Math.round(element.duration * 1000) : undefined });
      element.pause();
    }
  }, [video?.id]);
  useEffect(() => { interval.current = window.setInterval(() => { const element = media.current; if (element && !element.paused) persist(); }, 5000); return () => window.clearInterval(interval.current); }, [video?.id, mirrored]);

  const metadata = () => {
    const element = media.current;
    if (!element || !video) return;
    element.playbackRate = clamp(video.playbackRate ?? 1, .25, 1.5);
    element.preservesPitch = true;
    element.currentTime = clamp((video.positionMs ?? 0) / 1000, 0, Number.isFinite(element.duration) ? element.duration : 0);
    setDuration(element.duration * 1000); setTime(element.currentTime * 1000); setReady(true);
    persist({ durationMs: Math.round(element.duration * 1000) });
  };
  const togglePlay = async () => { const element = media.current; if (!element || !ready) return; try { if (element.paused) await element.play(); else element.pause(); } catch { setError("Playback was blocked. Click play to try again."); } };
  const seek = (delta: number) => { const element = media.current; if (!element || !ready) return; element.currentTime = clamp(element.currentTime + delta, 0, element.duration || 0); setTime(element.currentTime * 1000); persist(); };
  const stepByFrame = (direction: -1 | 1) => { const element = media.current; if (!element || !ready) return; element.pause(); element.currentTime = stepFrame(element.currentTime, direction, element.duration); setTime(element.currentTime * 1000); persist(); };
  const setSpeed = (input: number) => { const next = clamp(Number.isFinite(input) ? input : 1, .25, 1.5); if (media.current) media.current.playbackRate = next; setRate(next); persist({ playbackRate: next }); };
  const toggleMirror = () => { const next = !mirrored; setMirrored(next); persist({ mirrored: next }); };
  const toggleFullscreen = async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await player.current?.requestFullscreen?.();
    } catch { setError("Fullscreen could not be changed by this browser."); }
  };
  const jumpToBookmark = (bookmark: Bookmark) => { const element = media.current; if (!element) return; element.currentTime = bookmark.timestampMs / 1000; setTime(bookmark.timestampMs); persist(); };
  const createBookmark = () => { const element = media.current; if (!element) return; const timestampMs = Math.round(element.currentTime * 1000); element.pause(); onCreateBookmark(timestampMs); };
  const missing = video?.missing;

  return <section className="player-area">
    <div className="player-title"><div>{video ? <><span className="eyebrow">Now practicing</span><h1>{video.displayName}</h1></> : <><span className="eyebrow">Your practice library</span><h1>Choose a video to begin</h1></>}</div></div>
    <div className={`player-shell ${mirrored ? "mirrored" : ""}`} ref={player}>
      {video && !missing ? <video ref={media} src={`/api/videos/${encodeURIComponent(video.id)}/media`} preload="metadata" onLoadedMetadata={metadata} onTimeUpdate={() => { if (media.current) setTime(media.current.currentTime * 1000); }} onSeeked={() => persist()} onPlay={() => setPlaying(true)} onPause={() => { setPlaying(false); persist(); }} onEnded={() => { setPlaying(false); persist({ positionMs: Math.round((media.current?.duration ?? 0) * 1000) }); }} onError={() => { const mediaError = media.current?.error; const message = mediaError?.code === MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED ? "This file could not be decoded by your browser. Try an MP4/H.264/AAC copy." : "Video loading failed. Check that the file is still available."; setError(message); onMediaError(message); }} /> : <div className="player-placeholder"><span>{missing ? "⌁" : "▶"}</span><p>{missing ? "The app-managed video file is missing." : "Select or import a local dance video."}</p>{missing && <p className="muted">Reimport the identical original file from the library.</p>}</div>}
      {error && <div className="media-error" role="alert">{error}</div>}
      {video && !missing && <div className="video-controls">
        <div className="timeline-row"><span>{formatTime(time)}</span><div className="timeline-wrap"><input aria-label="Video timeline" type="range" min="0" max={duration || 1} value={time} disabled={!ready} onChange={(event) => { if (media.current) { media.current.currentTime = Number(event.target.value) / 1000; setTime(Number(event.target.value)); } }} onMouseUp={() => persist()} />{bookmarks.map((bookmark) => <button key={bookmark.id} className="marker" style={{ left: `${duration ? (bookmark.timestampMs / duration) * 100 : 0}%` }} title={`${bookmark.title} · ${formatTime(bookmark.timestampMs, true)}`} aria-label={`Jump to ${bookmark.title}`} onClick={() => jumpToBookmark(bookmark)} />)}</div><span>{formatTime(duration)}</span></div>
        <div className="controls-row">
          <button aria-label={playing ? "Pause" : "Play"} className="play-button" disabled={!ready} onClick={togglePlay}>{playing ? "❚❚" : "▶"}</button>
          <button disabled={!ready} aria-label={`Back ${seekStep} seconds`} onClick={() => seek(-seekStep)}>↶ <span>{seekStep}s</span></button>
          <button disabled={!ready} aria-label={`Forward ${seekStep} seconds`} onClick={() => seek(seekStep)}>↷ <span>{seekStep}s</span></button>
          <button disabled={!ready} aria-label="Previous frame" title="Previous frame (,)" onClick={() => stepByFrame(-1)}><span aria-hidden="true">&lt;</span></button>
          <button disabled={!ready} aria-label="Next frame" title="Next frame (.)" onClick={() => stepByFrame(1)}><span aria-hidden="true">&gt;</span></button>
          <div className="control-spacer" />
          <div className="bookmark-actions"><button disabled={!ready} onClick={createBookmark}>＋ Bookmark</button>{fullscreen && <FullscreenBookmarks bookmarks={bookmarks} draft={draft} open={bookmarksOpen} onToggle={() => setBookmarksOpen((open) => !open)} onCancel={onCancelDraft} onSave={onSaveDraft} onJump={(bookmark) => { jumpToBookmark(bookmark); setBookmarksOpen(false); }} />}</div>
          <button className={mirrored ? "toggled" : ""} disabled={!ready} onClick={toggleMirror} aria-label="Toggle mirror">↔ Mirror</button>
          <label className="speed-control">Speed<input aria-label="Playback speed" type="number" min=".25" max="1.5" step=".01" value={rate.toFixed(2)} disabled={!ready} onChange={(event) => setSpeed(Number(event.target.value))} /><span>×</span></label>
          <input className="volume" aria-label="Volume" type="range" min="0" max="1" step=".01" value={muted ? 0 : volume} onChange={(event) => { const next = Number(event.target.value); if (media.current) { media.current.volume = next; media.current.muted = next === 0; } setVolume(next); setMuted(next === 0); }} />
          <button aria-label="Mute" disabled={!ready} onClick={() => { const next = !muted; if (media.current) media.current.muted = next; setMuted(next); }}>{muted ? "Unmute" : "Mute"}</button>
          <button aria-label={fullscreen ? "Exit fullscreen" : "Enter fullscreen"} disabled={!ready} onClick={() => void toggleFullscreen()}>⛶</button>
        </div>
      </div>}
    </div>
    <p className="shortcuts" aria-label="Keyboard shortcuts" style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: "7px 16px" }}>
      <span style={{ display: "inline-flex", alignItems: "center", gap: "4px", whiteSpace: "nowrap" }}><kbd>Space</kbd><span>Play / pause</span></span>
      <span style={{ display: "inline-flex", alignItems: "center", gap: "4px", whiteSpace: "nowrap" }}><kbd>←</kbd><kbd>→</kbd><span>Seek</span></span>
      <span style={{ display: "inline-flex", alignItems: "center", gap: "4px", whiteSpace: "nowrap" }}><kbd>&lt;</kbd><kbd>&gt;</kbd><span>Frame</span></span>
      <span style={{ display: "inline-flex", alignItems: "center", gap: "4px", whiteSpace: "nowrap" }}><kbd>N</kbd><kbd>M</kbd><span>{seekStep} {seekStep === 1 ? "second" : "seconds"}</span></span>
      <span style={{ display: "inline-flex", alignItems: "center", gap: "4px", whiteSpace: "nowrap" }}><kbd>B</kbd><span>Bookmark</span></span>
    </p>
  </section>;
}

function FullscreenBookmarks({ bookmarks, draft, open, onToggle, onCancel, onSave, onJump }: { bookmarks: Bookmark[]; draft: Draft | null; open: boolean; onToggle: () => void; onCancel: () => void; onSave: (draft: Draft) => Promise<void>; onJump: (bookmark: Bookmark) => void }) {
  const panelId = useId();
  return <div className="fullscreen-bookmarks"><button type="button" aria-haspopup="dialog" aria-expanded={open} aria-controls={panelId} onClick={onToggle}>Bookmarks <span aria-hidden="true">{open ? "⌃" : "⌄"}</span></button>{open && <section id={panelId} className="fullscreen-bookmark-menu" role="dialog" aria-label="Bookmarks"><div className="fullscreen-bookmark-heading"><strong>Bookmarks</strong><span>{bookmarks.length} saved</span></div>{draft && <FullscreenBookmarkEditor draft={draft} onCancel={onCancel} onSave={onSave} />}<div className="fullscreen-bookmark-list">{!draft && bookmarks.length === 0 && <p className="empty-copy">No bookmarks yet.</p>}{bookmarks.map((bookmark) => <button key={bookmark.id} className="fullscreen-bookmark-item" onClick={() => onJump(bookmark)}><time>{formatTime(bookmark.timestampMs, true)}</time><span>{bookmark.title}</span></button>)}</div></section>}</div>;
}

function FullscreenBookmarkEditor({ draft, onCancel, onSave }: { draft: Draft; onCancel: () => void; onSave: (draft: Draft) => Promise<void> }) {
  const input = useRef<HTMLInputElement>(null); const [title, setTitle] = useState(draft.title); const [saving, setSaving] = useState(false); const [error, setError] = useState("");
  useEffect(() => { setTitle(draft.title); setError(""); input.current?.focus(); }, [draft]);
  const save = async () => { if (!title.trim()) return; setSaving(true); setError(""); try { await onSave({ ...draft, title: title.trim() }); } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not save bookmark."); } finally { setSaving(false); } };
  return <form className="fullscreen-bookmark-editor" onSubmit={(event) => { event.preventDefault(); void save(); }}><p>New bookmark · {formatTime(draft.timestampMs, true)}</p><label>Bookmark name<input ref={input} value={title} onChange={(event) => setTitle(event.target.value)} /></label>{error && <p className="inline-error" role="alert">{error}</p>}<div className="editor-actions"><button type="button" className="quiet" onClick={onCancel}>Cancel</button><button className="primary" disabled={saving || !title.trim()}>{saving ? "Saving…" : "Save bookmark"}</button></div></form>;
}
