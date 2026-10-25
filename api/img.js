import { send, param } from '../lib/http.js';
import { readBuffer } from '../lib/store.js';

const NAME = /^[A-Za-z0-9_-]+\.(?:jpg|png|webp|gif)$/;

export default async function handler(req, res) {
  try {
    let name = param(req, 'f', { pathFallback: true });
    if (name === 'img') name = '';
    const file = NAME.test(name) ? await readBuffer(`img/${name}`) : null;
    if (!file) return send(res, 404, 'Not found', { 'Content-Type': 'text/plain; charset=utf-8' });
    send(res, 200, file.buffer, {
      'Content-Type': file.contentType,
      'Cache-Control': 'public, max-age=31536000, immutable',
      'X-Content-Type-Options': 'nosniff',
    });
  } catch (err) {
    console.error(err);
    send(res, 500, 'Something went wrong.', { 'Content-Type': 'text/plain; charset=utf-8' });
  }
}
