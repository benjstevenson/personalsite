import { json, readJSON, wrap, sleep } from '../../lib/http.js';
import { configured, checkPassphrase, sessionCookie } from '../../lib/auth.js';

export default wrap(async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { error: 'POST only.' });
  if (!configured()) return json(res, 503, { error: 'The writing tool is not set up yet.', configured: false });
  if (req.headers['x-requested-with'] !== 'write') return json(res, 403, { error: 'Forbidden.' });

  const body = await readJSON(req, 10_000);
  if (!checkPassphrase(body.passphrase)) {
    await sleep(1200);
    return json(res, 401, { error: 'Wrong passphrase.' });
  }
  json(res, 200, { ok: true }, { 'Set-Cookie': sessionCookie(req) });
});
