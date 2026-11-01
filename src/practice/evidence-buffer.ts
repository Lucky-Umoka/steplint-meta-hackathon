import type { Pixels } from "./tracker";
export type EvidenceFrame = { id: string; atMs: number; image: Pixels };
/** Bounded raw pixels. JPEG encoding happens on export, never on the decision path. */
export class EvidenceBuffer {
  private recent = new Map<string, EvidenceFrame>();
  private held = new Map<string, EvidenceFrame>();
  private committed = new Map<string, EvidenceFrame>();
  add(id: string, atMs: number, image: Pixels) {
    this.recent.set(id, {
      id,
      atMs,
      image: {
        width: image.width,
        height: image.height,
        data: new Uint8ClampedArray(image.data),
      },
    });
    while (this.recent.size > 24)
      this.recent.delete(this.recent.keys().next().value!);
  }
  private get(id: string) {
    return (
      this.recent.get(id) ??
      this.committed.get(id) ??
      [...this.held.values()].find((frame) => frame.id === id)
    );
  }
  hold(key: string, id: string) {
    const frame = this.get(id);
    if (frame) this.held.set(key, frame);
    while (this.held.size > 12)
      this.held.delete(this.held.keys().next().value!);
  }
  commit(ids: string[]) {
    for (const id of new Set(ids)) {
      const frame = this.get(id);
      if (frame) this.committed.set(id, frame);
    }
    while (this.committed.size > 60)
      this.committed.delete(this.committed.keys().next().value!);
  }
  frames() {
    const frames = new Map([
      ...this.committed,
      ...[...this.held.values()].map((frame) => [frame.id, frame] as const),
    ]);
    return [...frames.values()].sort((a, b) => a.atMs - b.atMs);
  }
}
