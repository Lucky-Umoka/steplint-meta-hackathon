import { MAX_LESSON_MS } from "../media/limits";
import { z } from "zod";
import { parseApprovedArtifact } from "./approved-artifact";
export const ProcedureReferencesSchema = z.strictObject({
  before: z
    .string()
    .max(1_000_000)
    .regex(/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/),
  goal: z
    .string()
    .max(1_000_000)
    .regex(/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/),
  beforeMs: z.number().nonnegative().max(MAX_LESSON_MS),
  goalMs: z.number().nonnegative().max(MAX_LESSON_MS),
});
export type ProcedureReferences = z.infer<typeof ProcedureReferencesSchema>;
export type SavedProcedure = {
  id: string;
  title: string;
  raw: string;
  savedAt: number;
  references?: ProcedureReferences;
};
function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("steplint-approved-procedures", 1);
    request.onupgradeneeded = () =>
      request.result.createObjectStore("procedures", { keyPath: "id" });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(Error("Approved lesson storage could not open."));
  });
}
export async function saveApprovedProcedure(
  raw: string,
  references?: ProcedureReferences,
) {
  const checkedReferences = references
    ? ProcedureReferencesSchema.parse(references)
    : undefined;
  if (raw.length > 1_500_000)
    throw Error("Approved lesson exceeds the storage limit.");
  const artifact = parseApprovedArtifact(JSON.parse(raw));
  const db = await database();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction("procedures", "readwrite");
      const store = tx.objectStore("procedures");
      const previous = store.get(artifact.procedure.id);
      previous.onsuccess = () => {
        const row: unknown = previous.result;
        const prior =
          row &&
          typeof row === "object" &&
          "raw" in row &&
          row.raw === raw &&
          "references" in row
            ? ProcedureReferencesSchema.safeParse(row.references)
            : null;
        store.put({
          id: artifact.procedure.id,
          title: artifact.procedure.title,
          raw,
          savedAt: Date.now(),
          references:
            checkedReferences ?? (prior?.success ? prior.data : undefined),
        } satisfies SavedProcedure);
      };
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(Error("Could not save the approved lesson."));
    });
  } finally {
    db.close();
  }
}
export async function listApprovedProcedures(): Promise<SavedProcedure[]> {
  const db = await database();
  try {
    return await new Promise((resolve, reject) => {
      const request = db
        .transaction("procedures")
        .objectStore("procedures")
        .getAll();
      request.onsuccess = () => {
        try {
          const rows: unknown[] = request.result;
          resolve(
            rows.map((row) => {
              if (
                !row ||
                typeof row !== "object" ||
                !("raw" in row) ||
                typeof row.raw !== "string"
              )
                throw Error("Stored lesson is invalid.");
              const a = parseApprovedArtifact(JSON.parse(row.raw));
              return {
                id: a.procedure.id,
                title: a.procedure.title,
                raw: row.raw,
                references:
                  "references" in row &&
                  ProcedureReferencesSchema.safeParse(row.references).success
                    ? ProcedureReferencesSchema.parse(row.references)
                    : undefined,
                savedAt:
                  "savedAt" in row && typeof row.savedAt === "number"
                    ? row.savedAt
                    : 0,
              };
            }),
          );
        } catch (e) {
          reject(e);
        }
      };
      request.onerror = () => reject(Error("Could not read approved lessons."));
    });
  } finally {
    db.close();
  }
}
