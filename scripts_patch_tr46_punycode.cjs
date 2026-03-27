const fs = require('fs');
const path = require('path');

const candidates = [
  path.join(process.cwd(), 'node_modules', 'tr46', 'index.js'),
  path.join(process.cwd(), 'server', 'node_modules', 'tr46', 'index.js'),
  path.join(process.cwd(), 'webapp', 'node_modules', 'tr46', 'index.js'),
];

let patched = 0;
for (const file of candidates) {
  if (!fs.existsSync(file)) continue;
  const src = fs.readFileSync(file, 'utf8');
  if (src.includes('require("punycode/")') || src.includes("require('punycode/')")) {
    continue;
  }
  let next = src.replace('require("punycode")', 'require("punycode/")');
  next = next.replace("require('punycode')", "require('punycode/')");
  if (next !== src) {
    fs.writeFileSync(file, next, 'utf8');
    patched += 1;
    console.log(`[patch-tr46] patched ${path.relative(process.cwd(), file)}`);
  }
}
if (!patched) {
  console.log('[patch-tr46] nothing to patch');
}
