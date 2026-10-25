import { html, send, param } from '../lib/http.js';
import { getEssay, isValidSlug } from '../lib/essays.js';
import { essayPage } from '../lib/render.js';

export default async function handler(req, res) {
  try {
    let slug = param(req, 'slug', { pathFallback: true });
    if (slug === 'essay') slug = '';
    const essay = isValidSlug(slug) ? await getEssay(slug) : null;
    if (!essay) {
      return send(res, 404, 'Not found', { 'Content-Type': 'text/plain; charset=utf-8' });
    }
    html(res, 200, essayPage(essay), { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=600' });
  } catch (err) {
    console.error(err);
    send(res, 500, 'Something went wrong.', { 'Content-Type': 'text/plain; charset=utf-8' });
  }
}
