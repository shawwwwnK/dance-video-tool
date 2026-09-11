export type PlayerState = {
  positionMs: number;
  playbackRate: number;
  mirrored: boolean;
  durationMs?: number;
};

export type Video = {
  id: string;
  displayName: string;
  originalFilename: string;
  byteSize: number;
  importedAt: string;
  durationMs: number | null;
  contentHash: string;
  mediaUrl?: string;
  missing?: boolean;
  positionMs?: number;
  playbackRate?: number;
  mirrored?: boolean;
};

export type Bookmark = {
  id: string;
  videoId: string;
  timestampMs: number;
  title: string;
  description: string;
  createdAt: string;
  updatedAt: string;
};

export type Settings = { seekStepSeconds: number; lastVideoId?: string | null };

export type ApiError = Error & { status?: number };
