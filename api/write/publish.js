import { json, readJSON, wrap } from '../../lib/http.js';
import { guard } from '../../lib/auth.js';
import { publishDraft } from '../../lib/essays.js';

export default wrap(async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { error: 'POST only.' });
  if (!guard(req, res, { mutating: true })) return;

  const body = await readJSON(req);
  const result = await publishDraft({ title: body.title, html: body.html });
  if (result.expired) return json(res, 410, { expired: true, error: "Time's up. The draft was deleted." });
  if (result.error) return json(res, 400, { error: result.error });
  json(res, 200, { url: result.url, slug: result.slug });
});
