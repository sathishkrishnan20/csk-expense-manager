// Cloudflare Worker that stores the app's encrypted backups. It never sees anything it can read: the app compresses and
// encrypts the backup on the phone and names it with a hash, so the Worker only keeps one opaque text blob per hash.
//
//   PUT    /backup/<id>   save (replace) the blob      <id> = 64 lowercase hex characters
//   GET    /backup/<id>   return the blob, or 404
//   DELETE /backup/<id>   remove the blob
//
// Deploy with `npx wrangler deploy` from this folder (see README.md).

// The part of Cloudflare KV that is used, so the handler can be tested without Cloudflare.
export interface KvLike {
  get(key: string): Promise<string | null>;
  getWithMetadata<M>(key: string): Promise<{ value: string | null; metadata: M | null }>;
  put(key: string, value: string, options?: { metadata?: unknown }): Promise<void>;
  delete(key: string): Promise<void>;
}

export interface Env {
  BACKUPS: KvLike;
}

interface BackupMetadata {
  updatedAt: string;
}

// Same number as MAX_UPLOAD_CHARS in the app (src/domain/cloudBackup.ts). KV itself allows 25 MiB per value.
export const MAX_BODY_CHARS = 10_000_000;

const ID = /^[0-9a-f]{64}$/;
// Sealed backups start with the bytes "EMB" and format 1, which is "RU1CA" in base64. Anything else is not from the app.
const BODY = /^RU1CA[A-Za-z0-9+/]+={0,2}$/;

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, PUT, DELETE, OPTIONS",
  "access-control-allow-headers": "content-type",
  "access-control-expose-headers": "x-updated-at",
  "cache-control": "no-store",
};

const reply = (status: number, body: string | null = null, extra: Record<string, string> = {}): Response =>
  new Response(body, { status, headers: { ...CORS, ...extra } });

export async function handle(request: Request, env: Env): Promise<Response> {
  if (request.method === "OPTIONS") return reply(204);

  const { pathname } = new URL(request.url);
  if (pathname === "/") return reply(200, "Expense Manager backup server", { "content-type": "text/plain" });

  const match = /^\/backup\/([^/]+)$/.exec(pathname);
  if (!match || !ID.test(match[1])) return reply(404, "Not found");
  const id = match[1];

  switch (request.method) {
    case "PUT": {
      const declared = Number(request.headers.get("content-length") ?? 0);
      if (declared > MAX_BODY_CHARS) return reply(413, "This backup is too large.");
      const body = await request.text();
      if (body.length > MAX_BODY_CHARS) return reply(413, "This backup is too large.");
      if (!BODY.test(body)) return reply(400, "This is not a backup from the app.");
      await env.BACKUPS.put(id, body, { metadata: { updatedAt: new Date().toISOString() } satisfies BackupMetadata });
      return reply(200, "Saved");
    }
    case "GET": {
      const { value, metadata } = await env.BACKUPS.getWithMetadata<BackupMetadata>(id);
      if (value === null) return reply(404, "No backup found");
      return reply(200, value, { "content-type": "text/plain", "x-updated-at": metadata?.updatedAt ?? "" });
    }
    case "DELETE":
      await env.BACKUPS.delete(id);
      return reply(200, "Deleted");
    default:
      return reply(405, "Method not allowed", { allow: "GET, PUT, DELETE, OPTIONS" });
  }
}

export default {
  fetch: (request: Request, env: Env): Promise<Response> => handle(request, env),
};
