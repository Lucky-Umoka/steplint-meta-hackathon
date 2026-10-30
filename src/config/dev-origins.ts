/** Next matches hostname only for development assets/HMR, separately from Teach API auth. */
export function devOrigins(env: Record<string, string | undefined>): string[] {
  const hosts = new Set(["127.0.0.1"]);
  const name = env.CODESPACE_NAME, domain = env.GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN;
  if (name && domain && /^[a-z0-9-]+$/i.test(name) && /^[a-z0-9.-]+$/i.test(domain)) {
    const ports = new Set(["3000", "3001"]);
    if (env.PORT && /^\d+$/.test(env.PORT) && Number(env.PORT) > 0 && Number(env.PORT) <= 65535) ports.add(env.PORT);
    for (const port of ports) hosts.add(`${name}-${port}.${domain}`);
  }
  if (env.TEACH_PUBLIC_ORIGIN) {
    const url = new URL(env.TEACH_PUBLIC_ORIGIN);
    if (!["http:", "https:"].includes(url.protocol) || url.origin !== env.TEACH_PUBLIC_ORIGIN) throw new Error("TEACH_PUBLIC_ORIGIN must be an exact HTTP(S) origin without a path.");
    hosts.add(url.hostname);
  }
  return [...hosts];
}
