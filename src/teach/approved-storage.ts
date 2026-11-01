import { ApprovedArtifactSchema } from "./approved-artifact";
export type SavedProcedure = {
  id: string;
  title: string;
  raw: string;
  savedAt: number;
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
export async function saveApprovedProcedure(raw: string) {
  if (raw.length > 1_500_000)
    throw Error("Approved lesson exceeds the storage limit.");
  const artifact = ApprovedArtifactSchema.parse(JSON.parse(raw));
  const db = await database();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction("procedures", "readwrite");
      tx.objectStore("procedures").put({
        id: artifact.procedure.id,
        title: artifact.procedure.title,
        raw,
        savedAt: Date.now(),
      } satisfies SavedProcedure);
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
              const a = ApprovedArtifactSchema.parse(JSON.parse(row.raw));
              return {
                id: a.procedure.id,
                title: a.procedure.title,
                raw: row.raw,
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
