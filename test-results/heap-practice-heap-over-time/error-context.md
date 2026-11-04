# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: heap.spec.ts >> practice heap over time
- Location: .media-lab/audio-probe/heap.spec.ts:3:1

# Error details

```
Error: page.waitForTimeout: Page crashed
```

# Test source

```ts
  1  | import { test } from '@playwright/test';
  2  | import { readFileSync, writeFileSync } from 'node:fs';
  3  | test('practice heap over time', async ({ page }) => {
  4  |   test.setTimeout(180000);
  5  |   await page.route('**/api/teach/**', (r) => r.abort());
  6  |   await page.route('**/api/practice/**', (r) => r.abort());
  7  |   const raw = readFileSync('.media-lab/live-e2e/results-run5/approved-artifact.json', 'utf8');
  8  |   await page.goto(process.env.BASE + '/');
  9  |   await page.evaluate(async (raw) => {
  10 |     const item = JSON.parse(raw);
  11 |     const db = await new Promise<IDBDatabase>((ok, ko) => { const r = indexedDB.open('steplint-approved-procedures', 1); r.onupgradeneeded = () => r.result.createObjectStore('procedures', { keyPath: 'id' }); r.onsuccess = () => ok(r.result); r.onerror = () => ko(r.error); });
  12 |     await new Promise<void>((ok) => { const tx = db.transaction('procedures', 'readwrite'); tx.objectStore('procedures').put({ id: item.procedure.id, title: item.procedure.title, raw, savedAt: Date.now() }); tx.oncomplete = () => ok(); });
  13 |   }, raw);
  14 |   await page.goto(process.env.BASE + '/practice?lesson=' + JSON.parse(raw).procedure.id);
  15 |   const samples: unknown[] = [];
  16 |   const cdp = await page.context().newCDPSession(page);
  17 |   await cdp.send('Performance.enable');
  18 |   for (let i = 0; i < 18; i++) {
> 19 |     await page.waitForTimeout(5000);
     |                ^ Error: page.waitForTimeout: Page crashed
  20 |     const m = await cdp.send('Performance.getMetrics');
  21 |     const get = (n: string) => Math.round((m.metrics.find((x) => x.name === n)?.value ?? 0) / 1048576);
  22 |     samples.push({ t: (i + 1) * 5, heapMB: get('JSHeapUsedSize'), totalMB: get('JSHeapTotalSize'), nodes: m.metrics.find((x) => x.name === 'Nodes')?.value, state: await page.locator('#local-practice-status').getAttribute('data-lifecycle-state') });
  23 |     writeFileSync('.media-lab/audio-probe/heap.json', JSON.stringify(samples, null, 1));
  24 |   }
  25 |   writeFileSync('.media-lab/audio-probe/heap.json', JSON.stringify(samples, null, 1));
  26 | });
  27 | 
```