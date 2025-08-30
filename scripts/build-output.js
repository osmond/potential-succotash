/* Build Output API packager for Vercel
 * - Emits static files to .vercel/output/static
 * - Emits serverless functions to .vercel/output/functions
 */
const fs = require('fs');
const path = require('path');

function ensureDir(p){ fs.mkdirSync(p, { recursive: true }); }
function cp(src, dest){ fs.copyFileSync(src, dest); }
function writeJSON(p, obj){ fs.writeFileSync(p, JSON.stringify(obj, null, 2)); }

const ROOT = process.cwd();
const OUT = path.join(ROOT, '.vercel', 'output');
const STATIC = path.join(OUT, 'static');
ensureDir(STATIC);

// Static files to ship
const staticFiles = [
  'index.html',
  'health.html',
  'styles.css',
  'tailwind.css',
  'app.js',
  'db.js',
  'sw.js',
  'manifest.webmanifest',
  'config.js'
];

for(const f of staticFiles){
  const src = path.join(ROOT, f);
  if(fs.existsSync(src)) cp(src, path.join(STATIC, path.basename(f)));
}

// Functions
const funcs = [
  ['api/suggest.js', 'api/suggest.func'],
  ['api/plan.js', 'api/plan.func']
];
for(const [srcRel, outRel] of funcs){
  const src = path.join(ROOT, srcRel);
  if(!fs.existsSync(src)) continue;
  const funcDir = path.join(OUT, 'functions', outRel);
  ensureDir(funcDir);
  cp(src, path.join(funcDir, 'index.js'));
  writeJSON(path.join(funcDir, '.vc-config.json'), {
    runtime: 'nodejs20.x',
    handler: 'index.js'
  });
}

// Build Output API config (SPA fallback)
const config = {
  version: 3,
  routes: [
    { handle: 'filesystem' },
    { src: '/(.*)', dest: '/index.html' }
  ]
};
ensureDir(OUT);
writeJSON(path.join(OUT, 'config.json'), config);

console.log('Build Output API packaged to .vercel/output');
