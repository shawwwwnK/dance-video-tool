import type { Bookmark, PlayerState, Settings, Video } from "./types";

const base = "/api";

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${base}${path}`, {
    ...init,
    headers: { ...(init.body instanceof FormData ? {} : { "Content-Type": "application/json" }), ...(init.method && init.method !== "GET" && init.method !== "HEAD" ? { "X-LindyLoop-Request": "1" } : {}), ...init.headers },
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    const error = new Error(body.error ?? body.message ?? `Request failed (${response.status})`) as Error & { status?: number };
    error.status = response.status;
    throw error;
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

// The server accepts/returns camelCase JSON; unwrap list envelopes to keep this client tolerant.
const list = <T>(payload: T[] | { items?: T[]; videos?: T[]; bookmarks?: T[] }) =>
  Array.isArray(payload) ? payload : (payload.items ?? payload.videos ?? payload.bookmarks ?? []);

export const api = {
  async videos() { return list<Video>(await request<Video[] | { videos: Video[] }>("/videos")); },
  video: (id: string) => request<Video>(`/videos/${encodeURIComponent(id)}`),
  async createVideo(file: File, onProgress: (progress: number) => void) {
    // XMLHttpRequest is intentional: Fetch still cannot report upload progress reliably.
    return new Promise<Video>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open("POST", `${base}/videos`);
      xhr.responseType = "json";
      xhr.setRequestHeader("X-LindyLoop-Request", "1");
      xhr.upload.onprogress = (event) => event.lengthComputable && onProgress(event.loaded / event.total);
      xhr.onerror = () => reject(new Error("The import connection failed."));
      xhr.onabort = () => reject(new Error("Import cancelled."));
      xhr.onload = () => xhr.status >= 200 && xhr.status < 300
        ? resolve(xhr.response.video ?? xhr.response)
        : reject(new Error(xhr.response?.error ?? `Import failed (${xhr.status}).`));
      const data = new FormData(); data.append("file", file); xhr.send(data);
    });
  },
  updateVideo: async (id: string, patch: Partial<Pick<Video, "displayName">>) => (await request<{ video: Video }>(`/videos/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(patch) })).video,
  deleteVideo: (id: string) => request<void>(`/videos/${encodeURIComponent(id)}`, { method: "DELETE" }),
  reimport: async (id: string, file: File) => { const body = new FormData(); body.append("file", file); return (await request<{ video: Video }>(`/videos/${encodeURIComponent(id)}/recover`, { method: "POST", body })).video; },
  playerState: async (id: string, state: PlayerState) => (await request<{ video: Video }>(`/videos/${encodeURIComponent(id)}/state`, { method: "PUT", body: JSON.stringify(state) })).video,
  async bookmarks(videoId: string) { return list<Bookmark>(await request<Bookmark[] | { bookmarks: Bookmark[] }>(`/videos/${encodeURIComponent(videoId)}/bookmarks`)); },
  createBookmark: async (videoId: string, data: Pick<Bookmark, "timestampMs" | "title" | "description">) => (await request<{ bookmark: Bookmark }>(`/videos/${encodeURIComponent(videoId)}/bookmarks`, { method: "POST", body: JSON.stringify(data) })).bookmark,
  updateBookmark: async (id: string, patch: Partial<Pick<Bookmark, "timestampMs" | "title" | "description">>) => (await request<{ bookmark: Bookmark }>(`/bookmarks/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(patch) })).bookmark,
  deleteBookmark: (id: string) => request<void>(`/bookmarks/${encodeURIComponent(id)}`, { method: "DELETE" }),
  settings: () => request<Settings>("/settings"),
  updateSettings: (patch: Partial<Settings>) => request<Settings>("/settings", { method: "PUT", body: JSON.stringify(patch) }),
  exportMetadata: async () => { const response = await fetch(`${base}/metadata/export`); if (!response.ok) throw new Error("Could not export metadata."); return response.blob(); },
  importMetadata: async (file: File) => request<{ imported: number; skipped: number }>("/metadata/import", { method: "POST", body: await file.text() }),
};
