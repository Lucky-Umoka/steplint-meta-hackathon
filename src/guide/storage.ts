import { ArtifactSchema, type GuideArtifact } from "./schema";
import { z } from "zod";
import type { TimingRecord } from "./timing";
export const TimingRecordSchema = z.strictObject({
  at: z.number().int().nonnegative(),
  completed: z.boolean(),
  activeMs: z.number().nonnegative(),
  pausedMs: z.number().nonnegative(),
  verificationMs: z.number().nonnegative(),
  elapsedMs: z.number().nonnegative(),
  corrections: z.number().int().nonnegative(),
  stepMs: z.record(z.string(), z.number().nonnegative()),
});
export const SavedGuideSchema = z.strictObject({
  key: z.string().min(1),
  artifact: ArtifactSchema,
  savedAt: z.number().int().nonnegative(),
  attempts: z.array(TimingRecordSchema).max(30).optional(),
  rehearsal: z
    .strictObject({
      at: z.number().int().nonnegative(),
      passed: z.boolean(),
      events: z.number().int().nonnegative(),
      hadViolations: z.boolean().optional(),
    })
    .nullable()
    .default(null),
});
export type SavedGuide = z.infer<typeof SavedGuideSchema>;
export function parseSavedGuide(input: unknown): SavedGuide {
  const result = SavedGuideSchema.safeParse(input);
  if (!result.success)
    throw Error(
      "A saved guide is damaged or needs a new review. Return to Teach to recreate it.",
    );
  if (result.data.key !== guideKey(result.data.artifact))
    throw Error("The saved guide revision does not match its library entry.");
  return result.data;
}
export const guideKey = (a: GuideArtifact) =>
  `${a.guide.id}:${a.guide.revision}:${a.guide.methodId}:${a.guide.approval?.purpose}`;
export interface GuideRepository {
  list(): Promise<SavedGuide[]>;
  save(artifact: GuideArtifact): Promise<void>;
  remove(key: string): Promise<void>;
  recordAttempt(key: string, result: TimingRecord): Promise<void>;
  recordRehearsal(
    key: string,
    passed: boolean,
    events: number,
    hadViolations?: boolean,
  ): Promise<void>;
}
let pending: Promise<IDBDatabase> | null = null;
function database() {
  if (!pending)
    pending = new Promise<IDBDatabase>((resolve, reject) => {
      if (!globalThis.indexedDB) {
        reject(
          Error(
            "This browser cannot save guides. Use a regular Chrome window.",
          ),
        );
        return;
      }
      const req = indexedDB.open("steplint-guides", 2);
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains("guides"))
          req.result.createObjectStore("guides", { keyPath: "key" });
        if (!req.result.objectStoreNames.contains("drafts"))
          req.result.createObjectStore("drafts");
      };
      req.onsuccess = () => {
        req.result.onversionchange = () => {
          req.result.close();
          pending = null;
        };
        resolve(req.result);
      };
      req.onerror = () => {
        pending = null;
        reject(
          Error(
            "Guide storage could not open. Check browser storage permissions.",
          ),
        );
      };
      req.onblocked = () => {
        pending = null;
        reject(Error("Close other StepLint tabs, then try saving again."));
      };
    });
  return pending;
}
async function operation<T>(
  mode: IDBTransactionMode,
  run: (s: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await database();
  return new Promise<T>((resolve, reject) => {
    const tx = db.transaction("guides", mode);
    const req = run(tx.objectStore("guides"));
    tx.oncomplete = () => resolve(req.result);
    tx.onerror = tx.onabort = () =>
      reject(
        Error(
          tx.error?.name === "QuotaExceededError"
            ? "Browser storage is full. Free some space, then try saving again."
            : "The guide could not be saved. Keep this page open and try again.",
        ),
      );
  });
}
export const guideRepository: GuideRepository = {
  async list() {
    const items = await operation<unknown[]>("readonly", (s) => s.getAll());
    return items
      .map((item) => {
        return parseSavedGuide(item);
      })
      .sort((a, b) => b.savedAt - a.savedAt);
  },
  async save(value) {
    const artifact = ArtifactSchema.parse(value);
    await operation("readwrite", (s) =>
      s.put({
        key: guideKey(artifact),
        artifact,
        savedAt: Date.now(),
        rehearsal: null,
      } satisfies SavedGuide),
    );
  },
  async remove(key) {
    await operation("readwrite", (s) => s.delete(key));
  },
  async recordAttempt(key, result) {
    const rows = await this.list(),
      row = rows.find((r) => r.key === key);
    if (!row) throw Error("This guide is no longer saved.");
    const attempt = TimingRecordSchema.parse(result);
    await operation("readwrite", (s) =>
      s.put({
        ...row,
        attempts: [...(row.attempts ?? []), attempt].slice(-30),
      }),
    );
  },
  async recordRehearsal(key, passed, events, hadViolations = false) {
    const rows = await this.list();
    const row = rows.find((r) => r.key === key);
    if (!row) throw Error("The test revision is no longer saved.");
    await operation("readwrite", (s) =>
      s.put({
        ...row,
        rehearsal: { at: Date.now(), passed, events, hadViolations },
      }),
    );
  },
};

export async function saveDraft(value: unknown) {
  const db = await database();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction("drafts", "readwrite");
    tx.objectStore("drafts").put(value, "current");
    tx.oncomplete = () => resolve();
    tx.onabort = tx.onerror = () =>
      reject(
        Error("Could not keep the draft on this device. Keep this tab open."),
      );
  });
}
export async function loadDraft(): Promise<unknown> {
  const db = await database();
  return new Promise((resolve, reject) => {
    const req = db
      .transaction("drafts", "readonly")
      .objectStore("drafts")
      .get("current");
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(Error("Draft storage is unavailable."));
  });
}
export async function discardDraft() {
  const db = await database();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction("drafts", "readwrite");
    tx.objectStore("drafts").delete("current");
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(Error("The draft could not be removed."));
  });
}

export function latestPublished(rows: SavedGuide[]) {
  const latest = new Map<string, SavedGuide>();
  for (const row of rows) {
    const g = row.artifact.guide;
    if (g.approval?.purpose !== "published") continue;
    const key = `${g.id}:${g.methodId}`;
    if (
      !latest.has(key) ||
      latest.get(key)!.artifact.guide.revision < g.revision
    )
      latest.set(key, row);
  }
  return [...latest.values()].sort((a, b) => b.savedAt - a.savedAt);
}
