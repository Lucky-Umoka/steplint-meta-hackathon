import { test as base } from "@playwright/test";
/** Browser regressions never spend model credits. Individual provider mocks
 * register afterwards and override this last-resort deny rule. */
export const test = base.extend<{ noPaidRequests: void }>({
  noPaidRequests: [
    async ({ page }, use) => {
      await page.route("**/api/teach/**", (route) => {
        const path = new URL(route.request().url()).pathname;
        if (
          [
            "/api/teach/access",
            "/api/teach/approve",
            "/api/teach/practice-lesson",
            "/api/teach/guide/approve",
          ].includes(path)
        )
          return route.continue();
        return route.abort("blockedbyclient");
      });
      await use();
    },
    { auto: true },
  ],
});
export { expect, type Page } from "@playwright/test";
