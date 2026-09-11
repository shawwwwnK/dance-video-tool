# LindyLoop v1 specification

LindyLoop is a single-operator, local-only dance-video study application. It
uses a React/Vite client, an Express/TypeScript loopback API, SQLite metadata,
and ordinary media files. There are no accounts, cloud services, analytics,
remote runtime dependencies, URL/YouTube playback, transcoding, or video-byte
exports.

## Data contract

- Default data root: `~/Library/Application Support/LindyLoop`; use
  `LINDYLOOP_DATA_DIR` only for development/tests.
- SQLite is authoritative for videos, bookmarks, settings, and player state;
  migrations are versioned and writes are transactional.
- Media remains below the data root's media directory and is served only by
  internal video ID with byte-range support.
- Imports stream a single local selection to a temporary file while hashing it
  with SHA-256, then atomically finalize an app-managed copy. Default limit is
  2 GiB and must be configurable server-side. Source files are never changed.
- A video records stable ID, display name, original filename, byte size, import
  date, relative media path, duration when known, and content hash. Missing
  media retains its metadata and can be reconnected only to a matching hash.
- Deleting a video requires confirmation and removes its app copy and related
  bookmarks, never the source file.

## Player and bookmarks

- One selected video plays at a time, initially paused. Per-video position,
  speed (0.25–1.50 in .01 increments), and picture-only mirror state persist.
- Seek step is an app setting persisted in SQLite, 0.1–60 seconds in .1
  increments. Buttons and left/right keys share it, seek source time, clamp,
  and preserve playback state.
- The player exposes play/pause, timeline, time, volume/mute, fullscreen,
  speed, mirror, seek, and bookmark actions. It relies on media events and
  restores state only after metadata has loaded.
- Bookmarks are individual integer-millisecond timestamps. Creating one
  captures current time and pauses before opening a focused title editor.
  Existing valid edits autosave with feedback; deletion is confirmed. Text is
  rendered as text, searchable, Unicode-safe, and never HTML.
- Shortcuts are Space, Left/Right, B, and M, except while typing, composing,
  or using a native slider/dialog control.

## Security and backup

- Both servers bind to `127.0.0.1`; host and origin are allowlisted and
  mutating routes reject cross-site requests. There is no unrestricted CORS.
- API bodies, identifiers, timestamps, imports, and file paths are validated;
  paths cannot escape the media directory. Database, media, temporary files,
  WAL/journal files, logs, and personal data are ignored by Git.
- Versioned JSON export contains metadata only—not video bytes or trusted
  absolute paths. Import validates before writing, merges non-destructively,
  reports conflicts, and retains unmatched videos as missing-media records.

## Verification baseline

Unit/integration tests cover seek semantics, persistence, import/ranges,
bookmark lifecycle, export/import, and request safety. Browser tests use a
small redistributable WebM fixture and cover import/bookmark/reload. Manual
Chrome verification remains required for real iPhone recordings, audio at
0.25x, and any unavailable macOS-specific browser checks.
