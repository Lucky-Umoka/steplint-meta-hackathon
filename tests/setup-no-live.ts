// Automated tests never make live model calls (CLAUDE.md). Real provider
// keys from the developer environment are removed before any test runs;
// tests that need a key stub a fake one explicitly.
for (const name of ["MODEL_API_KEY", "BASETEN_API_KEY", "TEACH_ACCESS_TOKEN"])
  delete process.env[name];
