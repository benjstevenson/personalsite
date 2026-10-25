import crypto from 'node:crypto';
import { json, readBody, wrap } from '../../lib/http.js';
import { guard } from '../../lib/auth.js';
import { ensureDraft } from '../../lib/draft.js';
import { writeBuffer } from '../../lib/store.js';

// Identify the file by its first bytes, never by what the browser claims.
function sniff(b) {
  if (b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return { ext: 'jpg', type: 'image/jpeg' };
  if (b.length > 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return { ext: 'png', type: 'image/png' };
  if (b.length > 6 && b.subarray(0, 4).toString('latin1') === 'GIF8') return { ext: 'gif', type: 'image/gif' };
  if (b.length > 12 && b.subarray(0, 4).toString('latin1') === 'RIFF' && b.subarray(8, 12).toString('latin1') === 'WEBP') return { ext: 'webp', type: 'image/webp' };
  return null;
}

export default wrap(async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { error: 'POST only.' });
  if (!guard(req, res, { mutating: true })) return;

  const buf = await readBody(req, 4_000_000);
  const kind = sniff(buf);
  if (!kind) return json(res, 415, { error: 'That file is not a supported image (JPEG, PNG, GIF or WebP).' });

  // Dropping in an image counts as starting to write, so it starts the clock too.
  const { draft, expired } = await ensureDraft();
  if (expired) return json(res, 410, { expired: true, error: "Time's up. The draft was deleted." });

  const name = `${draft.id}-${crypto.randomBytes(8).toString('hex')}.${kind.ext}`;
  await writeBuffer(`img/${name}`, buf, kind.type);
  json(res, 200, { url: `/img/${name}`, now: Date.now(), deadline: draft.deadline, startedAt: draft.startedAt });
});
