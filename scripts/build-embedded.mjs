// Builds dist/worker.js: a Worker that serves everything in public/ from
// memory. An alternative to the static-assets deploy in wrangler.jsonc, for
// environments where the assets upload isn't available.
import { readdirSync, readFileSync, statSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, relative, extname } from 'node:path';

const root = new URL('../public/', import.meta.url).pathname;
const types = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml',
  '.webmanifest': 'application/manifest+json', '.png': 'image/png',
};
const binary = new Set(['.png']);
const files = {};
(function walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p);
    else if (types[extname(p)]) {
      const ext = extname(p);
      files['/' + relative(root, p)] = [types[ext], binary.has(ext) ? readFileSync(p).toString('base64') : readFileSync(p, 'utf8'), '', binary.has(ext)];
    }
  }
})(root);

// A short content hash per file, so browsers can revalidate cheaply and never
// mix an old script with a new page.
import { createHash } from 'node:crypto';
for (const k of Object.keys(files)) files[k][2] = createHash('sha1').update(files[k][1]).digest('hex').slice(0, 16);

const src = `const FILES = ${JSON.stringify(files)};
const bytes = (b64) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
export default {
  fetch(request) {
    let path = new URL(request.url).pathname;
    if (path.endsWith('/')) path += 'index.html';
    const f = FILES[path];
    if (!f) return new Response('Not found', { status: 404 });
    const etag = '"' + f[2] + '"';
    const headers = { 'content-type': f[0], 'cache-control': 'no-cache', etag };
    if (request.headers.get('if-none-match') === etag) return new Response(null, { status: 304, headers });
    return new Response(f[3] ? bytes(f[1]) : f[1], { headers });
  },
};
`;
mkdirSync(new URL('../dist/', import.meta.url), { recursive: true });
writeFileSync(new URL('../dist/worker.js', import.meta.url), src);
console.log(`Embedded ${Object.keys(files).length} files`);
