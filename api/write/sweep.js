// Daily cleanup (Vercel Cron). Expired drafts are already deleted the moment anyone
// touches them; this just guarantees an abandoned one doesn't linger for long.
import { json, wrap } from '../../lib/http.js';
import { loadDraft } from '../../lib/draft.js';

export default wrap(async function handler(req, res) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.authorization !== `Bearer ${secret}`) return json(res, 401, { error: 'Unauthorized.' });
  const { expired } = await loadDraft();
  json(res, 200, { ok: true, swept: expired });
});
