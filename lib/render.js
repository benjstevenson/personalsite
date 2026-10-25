// Server-rendered pages that look like the rest of the simple site.

const SITE = 'https://benstevenson.io';

export const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export const formatDate = (ms) =>
  new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'America/Chicago' }).format(new Date(ms));

function shell({ title, description, path, body }) {
  const desc = description ? `\n  <meta name="description" content="${esc(description)}">` : '';
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${esc(title)}</title>${desc}
  <meta property="og:title" content="${esc(title)}">
  <meta property="og:type" content="article">
  <meta property="og:url" content="${SITE}${path}">
  <link rel="canonical" href="${SITE}${path}">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="/styles.css">
  <script defer src="/_vercel/insights/script.js"></script>
</head>
<body>
  <nav class="sitenav">
    <a href="/index.html">Home</a>
    <a href="/work.html">My Work</a>
    <a href="/quotes.html">Quotes</a>
    <a href="/story.html">My Story</a>
    <a href="/contact.html">Contact</a>
  </nav>

  <main>
${body}
  </main>
</body>
</html>
`;
}

export function essayPage(essay) {
  return shell({
    title: `${essay.title} — Ben Stevenson`,
    description: essay.description,
    path: `/essays/${essay.slug}`,
    body: `    <article>
      <h1>${esc(essay.title)}</h1>
      <p class="essay-meta">${formatDate(essay.publishedAt)}</p>
      <div class="essay-body">
${essay.html}
      </div>
    </article>`,
  });
}

export function indexPage(essays) {
  const list = essays.length
    ? `    <ul class="essay-list">\n${essays
        .map(
          (e) =>
            `      <li><a href="/essays/${esc(e.slug)}">${esc(e.title)}</a> <span class="meta">${formatDate(e.publishedAt)}</span></li>`,
        )
        .join('\n')}\n    </ul>`
    : `    <p class="tagline">Nothing published yet.</p>`;
  return shell({
    title: 'Essays — Ben Stevenson',
    description: 'Essays by Ben Stevenson.',
    path: '/essays',
    body: `    <h1>Essays</h1>\n${list}`,
  });
}
