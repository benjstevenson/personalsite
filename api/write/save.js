import { json, readJSON, wrap } from '../../lib/http.js';
import { guard } from '../../lib/auth.js';
import { saveDraft, publicDraft } from '../../lib/draft.js';

export default wrap(async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { error: 'POST only.' });
  if (!guard(req, res, { mutating: true })) return;

  const body = await readJSON(req);
  const result = await saveDraft({ title: body.title, html: body.html });
  if (result.expired) return json(res, 410, { expired: true, error: "Time's up. The draft was deleted." });
  json(res, 200, { now: Date.now(), draft: publicDraft(result.draft) });
});
