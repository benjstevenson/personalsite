import { json, wrap } from '../../lib/http.js';
import { configured, isAuthed } from '../../lib/auth.js';
import { loadDraft, publicDraft } from '../../lib/draft.js';

export default wrap(async function handler(req, res) {
  if (req.method !== 'GET') return json(res, 405, { error: 'GET only.' });
  if (!configured()) return json(res, 200, { configured: false, authed: false });
  if (!isAuthed(req)) return json(res, 200, { configured: true, authed: false });

  const { draft, expired } = await loadDraft();
  json(res, 200, { configured: true, authed: true, now: Date.now(), expired, draft: publicDraft(draft) });
});
