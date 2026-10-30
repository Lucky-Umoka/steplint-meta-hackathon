import type { GuideObservation } from "./schema";
export type ObservationQuality = {
  checked: number;
  usable: number;
  missing: number;
  ambiguous: number;
  obstructed: number;
  lastAt: number;
  lastId: string | null;
};
export function createObservationQuality(): ObservationQuality {
  return {
    checked: 0,
    usable: 0,
    missing: 0,
    ambiguous: 0,
    obstructed: 0,
    lastAt: -1,
    lastId: null,
  };
}
/** Availability of evidence, not accuracy or the probability that a learner acted correctly. */
export function recordObservationQuality(
  q: ObservationQuality,
  observation: GuideObservation,
  required: string[],
) {
  if (observation.timestampMs <= q.lastAt || observation.id === q.lastId)
    return;
  q.lastAt = observation.timestampMs;
  q.lastId = observation.id;
  for (const id of new Set(required)) {
    const object = observation.objects.find((item) => item.objectId === id);
    q.checked++;
    if (!object || object.quality === "missing") q.missing++;
    else if (object.quality === "obstructed") q.obstructed++;
    else if (
      object.quality === "ambiguous" ||
      object.score === null ||
      object.score < 0.9 ||
      !object.box
    )
      q.ambiguous++;
    else q.usable++;
  }
}
export function evidenceAvailability(q: ObservationQuality) {
  return {
    ...q,
    usableFraction: q.checked ? q.usable / q.checked : null,
    uncertainFraction: q.checked ? (q.checked - q.usable) / q.checked : null,
  };
}
