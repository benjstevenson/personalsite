import { html, send } from '../lib/http.js';
import { listEssays } from '../lib/essays.js';
import { indexPage } from '../lib/render.js';

export default async function handler(req, res) {
  try {
    html(res, 200, indexPage(await listEssays()), { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=600' });
  } catch (err) {
    console.error(err);
    send(res, 500, 'Something went wrong.', { 'Content-Type': 'text/plain; charset=utf-8' });
  }
}
