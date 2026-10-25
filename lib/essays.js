// Published essays live in the same private store as `essays/<slug>.json`.

import { readJSON, writeJSON, remove, listPrefix } from './store.js';
import { loadDraft, imagePrefix } from './draft.js';
import { cleanHtml, plainText, imageNamesIn } from './sanitize.js';

const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,80}$/;

export const isValidSlug = (s) => SLUG_RE.test(s);

function slugify(title) {
  return (
    String(title)
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/['’]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60)
      .replace(/-+$/g, '') || 'untitled'
  );
}

export async function getEssay(slug) {
  if (!isValidSlug(slug)) return null;
  return readJSON(`essays/${slug}.json`);
}

export async function listEssays() {
  const files = await listPrefix('essays/');
  const essays = (await Promise.all(files.filter((f) => f.pathname.endsWith('.json')).map((f) => readJSON(f.pathname)))).filter(Boolean);
  return essays.sort((a, b) => b.publishedAt - a.publishedAt);
}

// Publishes the current draft if (and only if) its timer is still running.
export async function publishDraft({ title, html }) {
  const { draft, expired } = await loadDraft();
  if (expired) return { expired: true };
  if (!draft) return { error: 'There is nothing to publish yet.' };

  title = String(title ?? '').trim().slice(0, 200);
  const body = cleanHtml(html);
  if (!title) return { error: 'Give it a title first.' };
  if (!plainText(body) && !/<img\b/i.test(body)) return { error: 'Write something first.' };

  const taken = new Set((await listPrefix('essays/')).map((f) => f.pathname.replace(/^essays\//, '').replace(/\.json$/, '')));
  const base = slugify(title);
  let slug = base;
  for (let n = 2; taken.has(slug); n++) slug = `${base}-${n}`;

  const now = Date.now();
  const essay = {
    slug,
    title,
    html: body,
    description: plainText(body).slice(0, 180),
    publishedAt: now,
    writtenMs: now - draft.startedAt,
    limitHours: draft.hours,
  };
  await writeJSON(`essays/${slug}.json`, essay);

  // The essay is live now. Cleanup is best-effort so a storage hiccup can never turn a
  // successful publish into an error (which would invite publishing it twice).
  try {
    // Keep only the images the essay actually uses; discard the rest of the draft.
    const keep = new Set(imageNamesIn(body));
    const uploaded = await listPrefix(imagePrefix(draft.id));
    const unused = uploaded.filter((i) => !keep.has(i.pathname.replace(/^img\//, '')));
    await remove(unused.map((i) => i.pathname));
  } catch (err) {
    console.error('Could not remove unused draft images', err);
  }
  try {
    await remove('write/draft.json');
  } catch (err) {
    console.error('Could not remove the published draft', err);
  }

  return { slug, url: `/essays/${slug}` };
}
