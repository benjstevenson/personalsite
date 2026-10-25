// The one active draft and its non-negotiable deadline.
//
// Rules, all enforced here on the server:
//  - The clock starts the first time something is saved, for 1, 2 or 3 hours (picked
//    before starting). The deadline never moves and the length can't be changed.
//  - There is no pause and no cancel. Only publishing (or time running out) ends a draft.
//  - Once the deadline passes, the draft and its uploaded images are deleted.

import crypto from 'node:crypto';
import { readJSON, writeJSON, remove, listPrefix } from './store.js';

export const HOUR_CHOICES = [1, 2, 3];
export const DEFAULT_HOURS = 3;
const HOUR_MS = 60 * 60 * 1000;

// Only 1, 2 or 3 are accepted; anything else falls back to the default.
export const normalizeHours = (h) => (HOUR_CHOICES.includes(Number(h)) ? Number(h) : DEFAULT_HOURS);
const DRAFT_PATH = 'write/draft.json';
export const imagePrefix = (draftId) => `img/${draftId}-`;

const clip = (s, n) => String(s ?? '').slice(0, n);
const hasText = (html) => html.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim().length > 0;

export async function destroyDraft(draft) {
  const images = draft?.id ? await listPrefix(imagePrefix(draft.id)) : [];
  await remove([DRAFT_PATH, ...images.map((i) => i.pathname)]);
}

// Returns { draft, expired }. Deletes the draft first if its time is up.
export async function loadDraft() {
  const draft = await readJSON(DRAFT_PATH);
  if (!draft) return { draft: null, expired: false };
  if (Date.now() >= draft.deadline) {
    await destroyDraft(draft);
    return { draft: null, expired: true };
  }
  return { draft, expired: false };
}

export const publicDraft = (d) =>
  d && { title: d.title, html: d.html, startedAt: d.startedAt, deadline: d.deadline, savedAt: d.savedAt, hours: d.hours };

// Saves content. Starts the clock if this is the first real content.
// `startEmpty` lets an image upload start the clock before any text exists.
export async function saveDraft({ title, html, hours }, { startEmpty = false } = {}) {
  const { draft, expired } = await loadDraft();
  if (expired) return { expired: true };

  title = clip(title, 200);
  html = clip(html, 1_500_000);

  let d = draft;
  if (!d) {
    const hasContent = title.trim() || hasText(html) || /<img\b/i.test(html);
    if (!hasContent && !startEmpty) return { draft: null };
    const now = Date.now();
    const h = normalizeHours(hours);
    d = { id: crypto.randomBytes(8).toString('hex'), startedAt: now, hours: h, deadline: now + h * HOUR_MS, title: '', html: '' };
  }
  d = { ...d, title, html, savedAt: Date.now() };
  await writeJSON(DRAFT_PATH, d);
  return { draft: d };
}

// Makes sure a draft exists (used by image uploads) without touching its content.
export async function ensureDraft({ hours } = {}) {
  const { draft, expired } = await loadDraft();
  if (expired) return { expired: true };
  if (draft) return { draft };
  return saveDraft({ title: '', html: '', hours }, { startEmpty: true });
}
