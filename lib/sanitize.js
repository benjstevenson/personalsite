// Everything that gets published passes through this allowlist first,
// so a stray paste or a doctored request can never inject scripts into the site.

import sanitizeHtml from 'sanitize-html';

const IMG_SRC = /^\/img\/[A-Za-z0-9_-]+\.(?:jpe?g|png|webp|gif)$/i;

export function cleanHtml(dirty) {
  return sanitizeHtml(String(dirty ?? ''), {
    allowedTags: ['p', 'br', 'strong', 'em', 'u', 's', 'h2', 'h3', 'ul', 'ol', 'li', 'blockquote', 'a', 'img', 'hr', 'code', 'pre'],
    allowedAttributes: { a: ['href', 'target', 'rel'], img: ['src', 'alt'] },
    allowedSchemes: ['http', 'https', 'mailto'],
    allowedSchemesAppliedToAttributes: ['href'],
    allowProtocolRelative: false,
    transformTags: {
      b: 'strong',
      i: 'em',
      div: 'p',
      h1: 'h2',
      h4: 'h3',
      a: (tagName, attribs) => ({
        tagName: 'a',
        attribs: { href: attribs.href || '', target: '_blank', rel: 'noopener noreferrer' },
      }),
    },
    exclusiveFilter: (frame) => {
      if (frame.tag === 'img') return !IMG_SRC.test(frame.attribs.src || '');
      if (frame.tag === 'a') return !frame.attribs.href;
      if (frame.tag === 'p') return !frame.text.trim() && !frame.mediaChildren.length;
      return false;
    },
  }).trim();
}

export function plainText(html) {
  return sanitizeHtml(String(html ?? ''), { allowedTags: [], allowedAttributes: {} })
    .replace(/\s+/g, ' ')
    .trim();
}

export function imageNamesIn(html) {
  return [...String(html).matchAll(/\/img\/([A-Za-z0-9_-]+\.(?:jpe?g|png|webp|gif))/gi)].map((m) => m[1]);
}
