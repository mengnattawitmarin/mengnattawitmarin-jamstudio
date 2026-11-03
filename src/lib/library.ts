/**
 * Local song library in IndexedDB. Audio never leaves the device.
 * Each song stores the original file blob plus light metadata learned
 * from analysis (key, bpm, chords) so the list is useful before re-opening.
 */
export type SongMeta = {
  id: string;
  title: string;
  artist: string;
  size: number;
  type: string;
  addedAt: number;
  lastOpenedAt: number;
  duration?: number;
  key?: string;
  bpm?: number;
  chords?: string[];
  favorite?: boolean;
};

type SongRow = SongMeta & { blob: Blob };

const DB = "jamstudio";
const STORE = "songs";
const MAX_BYTES = 60 * 1024 * 1024;

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("no indexedDB"));
      return;
    }
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: "id" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("indexedDB open failed"));
  });
}

function tx<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return open().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(STORE, mode);
        const req = run(t.objectStore(STORE));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error ?? new Error("indexedDB request failed"));
        t.oncomplete = () => db.close();
      }),
  );
}

export function guessArtist(fileName: string): { title: string; artist: string } {
  const base = fileName.replace(/\.[^.]+$/, "").replace(/_/g, " ").trim();
  const parts = base.split(/\s+[-–—]\s+/);
  if (parts.length >= 2) return { artist: parts[0].trim(), title: parts.slice(1).join(" - ").trim() };
  return { title: base, artist: "" };
}

export async function listSongs(): Promise<SongMeta[]> {
  try {
    const rows = await tx<SongRow[]>("readonly", (store) => store.getAll() as IDBRequest<SongRow[]>);
    return rows
      .map(({ blob: _blob, ...meta }) => meta)
      .sort((a, b) => Number(b.favorite ?? false) - Number(a.favorite ?? false) || b.lastOpenedAt - a.lastOpenedAt);
  } catch {
    return [];
  }
}

export async function addSong(file: File): Promise<SongMeta> {
  if (file.size > MAX_BYTES) throw new Error("ไฟล์ใหญ่เกิน 60 MB");
  const { title, artist } = guessArtist(file.name);
  const now = Date.now();
  const row: SongRow = {
    id: `s-${now.toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
    title,
    artist,
    size: file.size,
    type: file.type || "audio/*",
    addedAt: now,
    lastOpenedAt: now,
    blob: file,
  };
  await tx("readwrite", (store) => store.put(row));
  const { blob: _blob, ...meta } = row;
  return meta;
}

export async function getSongBlob(id: string): Promise<{ meta: SongMeta; blob: Blob } | null> {
  try {
    const row = await tx<SongRow | undefined>("readonly", (store) => store.get(id) as IDBRequest<SongRow | undefined>);
    if (!row) return null;
    const { blob, ...meta } = row;
    return { meta, blob };
  } catch {
    return null;
  }
}

export async function updateSong(id: string, patch: Partial<Omit<SongMeta, "id">>): Promise<void> {
  const row = await tx<SongRow | undefined>("readonly", (store) => store.get(id) as IDBRequest<SongRow | undefined>);
  if (!row) return;
  await tx("readwrite", (store) => store.put({ ...row, ...patch, id }));
}

export async function deleteSong(id: string): Promise<void> {
  await tx("readwrite", (store) => store.delete(id));
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
