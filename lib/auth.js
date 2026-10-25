// One shared passphrase (env WRITE_PASSPHRASE) unlocks the writing tool.
// A successful login sets a signed, HttpOnly cookie. Nothing is stored server-side.

import crypto from 'node:crypto';
import { json } from './http.js';

const COOKIE = 'w_session';
const MAX_AGE_S = 16 * 60 * 60;

export const configured = () => Boolean(process.env.WRITE_PASSPHRASE);

const sha = (s) => crypto.createHash('sha256').update(String(s)).digest();

export function checkPassphrase(input) {
  if (!configured() || typeof input !== 'string' || !input) return false;
  return crypto.timingSafeEqual(sha(input), sha(process.env.WRITE_PASSPHRASE));
}

function sign(exp) {
  return crypto
    .createHmac('sha256', sha('write-session:' + process.env.WRITE_PASSPHRASE))
    .update(String(exp))
    .digest('hex');
}

export function sessionCookie(req) {
  const exp = Math.floor(Date.now() / 1000) + MAX_AGE_S;
  const secure = req.headers['x-forwarded-proto'] === 'https' ? '; Secure' : '';
  return `${COOKIE}=${exp}.${sign(exp)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${MAX_AGE_S}${secure}`;
}

function readCookie(req, name) {
  const header = req.headers.cookie || '';
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i > -1 && part.slice(0, i).trim() === name) return part.slice(i + 1).trim();
  }
  return '';
}

export function isAuthed(req) {
  if (!configured()) return false;
  const [exp, sig] = readCookie(req, COOKIE).split('.');
  if (!exp || !sig || !/^\d+$/.test(exp) || Number(exp) < Date.now() / 1000) return false;
  const want = Buffer.from(sign(exp));
  const got = Buffer.from(sig);
  return want.length === got.length && crypto.timingSafeEqual(want, got);
}

// Gate for every write endpoint. Returns true when the request may proceed.
// State-changing requests must also carry a custom header (blocks cross-site forms).
export function guard(req, res, { mutating = false } = {}) {
  if (!configured()) {
    json(res, 503, { error: 'The writing tool is not set up yet.', configured: false });
    return false;
  }
  if (!isAuthed(req)) {
    json(res, 401, { error: 'Locked.', authed: false });
    return false;
  }
  if (mutating && req.headers['x-requested-with'] !== 'write') {
    json(res, 403, { error: 'Forbidden.' });
    return false;
  }
  return true;
}
