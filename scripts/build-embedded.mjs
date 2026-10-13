// Builds dist/worker.js: a Worker that serves everything in public/ from
// memory. An alternative to the static-assets deploy in wrangler.jsonc, for
// environments where the assets upload isn't available.
import { readdirSync, readFileSync, statSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, relative, extname } from 'node:path';

const root = new URL('../public/', import.meta.url).pathname;
const types = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml',
};
const files = {};
(function walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p);
    else if (types[extname(p)]) files['/' + relative(root, p)] = [types[extname(p)], readFileSync(p, 'utf8')];
  }
})(root);

const src = `const FILES = ${JSON.stringify(files)};
export default {
  fetch(request) {
    let path = new URL(request.url).pathname;
    if (path.endsWith('/')) path += 'index.html';
    const f = FILES[path];
    if (!f) return new Response('Not found', { status: 404 });
    return new Response(f[1], { headers: { 'content-type': f[0], 'cache-control': 'public, max-age=300' } });
  },
};
`;
mkdirSync(new URL('../dist/', import.meta.url), { recursive: true });
writeFileSync(new URL('../dist/worker.js', import.meta.url), src);
console.log(`Embedded ${Object.keys(files).length} files`);
