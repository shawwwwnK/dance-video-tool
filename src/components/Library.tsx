import { useRef, useState } from "react";
import type { Video } from "../types";
import { formatTime } from "../lib/time";

type Props = { videos: Video[]; activeId?: string; importing: number | null; onSelect: (video: Video) => void; onImport: (file: File) => void; onReimport: (video: Video, file: File) => void; onRename: (video: Video, name: string) => void; onDelete: (video: Video) => void; };

export function Library({ videos, activeId, importing, onSelect, onImport, onReimport, onRename, onDelete }: Props) {
  const input = useRef<HTMLInputElement>(null);
  const recoveryInput = useRef<HTMLInputElement>(null);
  const [recovering, setRecovering] = useState<Video | null>(null);
  const [dragging, setDragging] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [name, setName] = useState("");
  const choose = (files: FileList | null) => files?.[0] && onImport(files[0]);
  return <aside className="library" aria-label="Video library">
    <div className="brand"><span className="brand-mark">L</span><span>LindyLoop</span></div>
    <input ref={input} className="sr-only" type="file" accept="video/mp4,video/quicktime,video/webm,.mp4,.mov,.webm" onChange={(e) => choose(e.target.files)} />
    <input ref={recoveryInput} className="sr-only" type="file" accept="video/mp4,video/quicktime,video/webm,.mp4,.mov,.webm" onChange={(e) => { const file = e.target.files?.[0]; if (file && recovering) onReimport(recovering, file); setRecovering(null); e.currentTarget.value = ""; }} />
    <button className="import-button" onClick={() => input.current?.click()}>＋ Import video</button>
    <div className={`drop-zone ${dragging ? "dragging" : ""}`} onDragOver={(e) => { e.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={(e) => { e.preventDefault(); setDragging(false); choose(e.dataTransfer.files); }}>
      Drop one local video here<br /><small>Copies it into your library</small>
    </div>
    {importing !== null && <div className="import-status"><span>Importing</span><progress value={importing} max="1" /> <span>{Math.round(importing * 100)}%</span></div>}
    <div className="library-heading">Library <span>{videos.length}</span></div>
    <div className="video-list">
      {videos.length === 0 ? <p className="empty-copy">Your imported videos will appear here.</p> : videos.map((video) => <div key={video.id} className={`video-item ${activeId === video.id ? "active" : ""}`} onClick={() => onSelect(video)}>
        <div className="video-item-main">
          {editing === video.id ? <input autoFocus value={name} aria-label="Video name" onClick={(e) => e.stopPropagation()} onChange={(e) => setName(e.target.value)} onBlur={() => { if (name.trim()) onRename(video, name.trim()); setEditing(null); }} onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); if (e.key === "Escape") setEditing(null); }} /> : <><strong title={video.displayName}>{video.displayName}</strong><span>{video.durationMs != null ? formatTime(video.durationMs) : "Duration unavailable"}</span></>}
        </div>
        <div className="item-actions" onClick={(e) => e.stopPropagation()}>
          <button aria-label={`Rename ${video.displayName}`} onClick={() => { setEditing(video.id); setName(video.displayName); }}>✎</button>
          <button aria-label={`Delete ${video.displayName}`} onClick={() => onDelete(video)}>×</button>
        </div>
        {video.missing && <button className="missing-tag" onClick={(e) => { e.stopPropagation(); setRecovering(video); recoveryInput.current?.click(); }}>Reimport file</button>}
      </div>)}
    </div>
  </aside>;
}
