// Small helpers shared by the API functions. Plain Node req/res only.

export function send(res, status, body, headers = {}) {
  res.statusCode = status;
  for (const [k, v] of Object.entries(headers)) res.setHeader(k, v);
  res.end(body);
}

export function json(res, status, obj, headers = {}) {
  send(res, status, JSON.stringify(obj), {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    ...headers,
  });
}

export function html(res, status, body, headers = {}) {
  send(res, status, body, { 'Content-Type': 'text/html; charset=utf-8', ...headers });
}

export async function readBody(req, limit = 4_000_000) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) {
      const err = new Error('That is too large.');
      err.status = 413;
      throw err;
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

export async function readJSON(req, limit = 2_000_000) {
  const buf = await readBody(req, limit);
  if (!buf.length) return {};
  try {
    return JSON.parse(buf.toString('utf8'));
  } catch {
    const err = new Error('Invalid request.');
    err.status = 400;
    throw err;
  }
}

// Reads a named value from the query string, falling back to the last path
// segment (rewrites can surface the value either way).
export function param(req, name, { pathFallback = false } = {}) {
  const url = new URL(req.url, 'http://localhost');
  const fromQuery = req.query?.[name] ?? url.searchParams.get(name);
  if (fromQuery) return String(Array.isArray(fromQuery) ? fromQuery[0] : fromQuery);
  if (pathFallback) {
    const last = decodeURIComponent(url.pathname.split('/').filter(Boolean).pop() || '');
    return last;
  }
  return '';
}

// Wraps a handler so thrown errors become tidy JSON responses.
export function wrap(handler) {
  return async function wrapped(req, res) {
    try {
      await handler(req, res);
    } catch (err) {
      const status = err.status || 500;
      if (status >= 500) console.error(err);
      if (!res.headersSent) {
        json(res, status, { error: status >= 500 ? 'Something went wrong on the server.' : err.message });
      }
    }
  };
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
