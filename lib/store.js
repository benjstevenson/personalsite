// Tiny storage layer. In production it talks to a *private* Vercel Blob store.
// When developing locally (no BLOB_READ_WRITE_TOKEN, not on Vercel) it falls back
// to plain files in ./.data so the whole flow can be tested offline.

import fs from 'node:fs/promises';
import path from 'node:path';

const TYPES = {
  '.json': 'application/json',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
};

const typeOf = (p) => TYPES[path.extname(p).toLowerCase()] || 'application/octet-stream';

function mode() {
  if (process.env.BLOB_READ_WRITE_TOKEN) return 'blob';
  if (!process.env.VERCEL) return 'local';
  throw new Error('Storage is not configured: BLOB_READ_WRITE_TOKEN is missing.');
}

let sdkPromise;
const sdk = () => (sdkPromise ??= import('@vercel/blob'));

function localPath(p) {
  const root = path.resolve(process.cwd(), '.data');
  const full = path.resolve(root, p);
  if (full !== root && !full.startsWith(root + path.sep)) throw new Error('Bad storage path.');
  return full;
}

export async function readBuffer(p) {
  if (mode() === 'local') {
    try {
      return { buffer: await fs.readFile(localPath(p)), contentType: typeOf(p) };
    } catch (e) {
      if (e.code === 'ENOENT') return null;
      throw e;
    }
  }
  const { get } = await sdk();
  let result;
  try {
    result = await get(p, { access: 'private', useCache: false });
  } catch (e) {
    if (e?.name === 'BlobNotFoundError') return null;
    throw e;
  }
  if (!result || !result.stream) return null;
  const buffer = Buffer.from(await new Response(result.stream).arrayBuffer());
  return { buffer, contentType: result.blob?.contentType || typeOf(p) };
}

export async function writeBuffer(p, buffer, contentType) {
  if (mode() === 'local') {
    const full = localPath(p);
    await fs.mkdir(path.dirname(full), { recursive: true });
    await fs.writeFile(full, buffer);
    return;
  }
  const { put } = await sdk();
  await put(p, buffer, {
    access: 'private',
    allowOverwrite: true,
    addRandomSuffix: false,
    contentType: contentType || typeOf(p),
    cacheControlMaxAge: 60,
  });
}

export async function readJSON(p) {
  const r = await readBuffer(p);
  if (!r) return null;
  try {
    return JSON.parse(r.buffer.toString('utf8'));
  } catch {
    return null;
  }
}

export const writeJSON = (p, obj) =>
  writeBuffer(p, Buffer.from(JSON.stringify(obj), 'utf8'), 'application/json');

export async function remove(paths) {
  const list = (Array.isArray(paths) ? paths : [paths]).filter(Boolean);
  if (!list.length) return;
  if (mode() === 'local') {
    await Promise.all(list.map((p) => fs.rm(localPath(p), { force: true })));
    return;
  }
  const { del } = await sdk();
  await del(list);
}

// Returns [{ pathname, uploadedAt }] for everything whose path starts with `prefix`.
export async function listPrefix(prefix) {
  if (mode() === 'local') {
    const root = localPath('.');
    const out = [];
    async function walk(dir) {
      let entries;
      try {
        entries = await fs.readdir(dir, { withFileTypes: true });
      } catch {
        return;
      }
      for (const e of entries) {
        const full = path.join(dir, e.name);
        if (e.isDirectory()) await walk(full);
        else {
          const rel = path.relative(root, full).split(path.sep).join('/');
          if (rel.startsWith(prefix)) out.push({ pathname: rel, uploadedAt: (await fs.stat(full)).mtime });
        }
      }
    }
    await walk(root);
    return out;
  }
  const { list } = await sdk();
  const out = [];
  let cursor;
  do {
    const page = await list({ prefix, limit: 1000, cursor });
    for (const b of page.blobs) out.push({ pathname: b.pathname, uploadedAt: new Date(b.uploadedAt) });
    cursor = page.hasMore ? page.cursor : undefined;
  } while (cursor);
  return out;
}
