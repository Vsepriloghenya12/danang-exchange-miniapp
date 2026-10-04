// Regenerate committed Telegram artwork using sharp (SHARP_MODULE can point to a bundled install).
const fs = require('node:fs');
const path = require('node:path');
const sharp = require(process.env.SHARP_MODULE || 'sharp');
const root = path.resolve(__dirname, '..');
const out = path.join(root, 'server/public/brand/telegram');
const whale = fs.readFileSync(path.join(out, 'whale.svg'), 'utf8').match(/<path d="([^"]+)"/)[1];
const navy = '#002B39', yellow = '#FFCF26';
const mark = (x, y, size, color) => `<g transform="translate(${x} ${y}) scale(${size / 440}) translate(-710 -80)"><path d="${whale}" fill="${color}" fill-rule="evenodd"/></g>`;
const svg = (w, h, content) => `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><rect width="${w}" height="${h}" fill="${navy}"/>${content}</svg>`;
const text = (x, y, size, value, color = '#FFFFFF', weight = 600) => `<text x="${x}" y="${y}" fill="${color}" font-family="Segoe UI, Arial, sans-serif" font-size="${size}" font-weight="${weight}">${value}</text>`;
const waves = `<g fill="none" stroke="#FFFFFF" stroke-opacity=".07" stroke-width="1.3"><path d="M-30 292C130 160 200 416 420 262S710 240 700 390"/><path d="M-30 315C130 183 200 439 420 285S710 263 700 413"/><path d="M-30 338C130 206 200 462 420 308S710 286 700 436"/></g>`;
const cover = svg(640, 360, waves + text(36, 62, 34, 'Cash a Lot', yellow, 700) + text(36, 159, 38, 'Обмен валют', '#FFFFFF', 700) + text(36, 205, 38, 'в Дананге', '#FFFFFF', 700) + text(38, 311, 16, 'Курсы · Обмен · Бонусы', '#B8CDD5', 400) + mark(392, 103, 205, yellow));
const invite = svg(640, 400, waves + text(36, 59, 29, 'Cash a Lot', yellow, 700) + text(36, 140, 32, 'Приглашай друзей.', '#FFFFFF', 700) + text(36, 181, 32, 'Обменивай выгоднее.', '#FFFFFF', 700) + `<rect x="36" y="242" width="116" height="55" rx="18" fill="${yellow}"/>` + text(51, 280, 30, '+0,5%', navy, 700) + text(36, 338, 16, 'Другу — к первому получению.', '#B8CDD5', 400) + text(36, 365, 16, 'Тебе — на бонусный счёт.', '#B8CDD5', 400) + mark(415, 218, 175, yellow));
const icon = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512"><rect width="512" height="512" fill="${yellow}"/>${mark(111, 105, 290, navy)}</svg>`;
(async () => {
  for (const [name, content] of [['cover', cover], ['invite', invite], ['app-icon', icon]]) {
    fs.writeFileSync(path.join(out, name + '.svg'), content);
    await sharp(Buffer.from(content)).png().toFile(path.join(out, name + '.png'));
    if (name !== 'app-icon') await sharp(Buffer.from(content)).jpeg({ quality: 91 }).toFile(path.join(out, name + '.jpg'));
  }
  await sharp(Buffer.from(icon)).resize(192, 192).png().toFile(path.join(out, 'app-icon-192.png'));
  await sharp(Buffer.from(icon)).resize(180, 180).png().toFile(path.join(out, 'apple-touch-icon.png'));
  await sharp(Buffer.from(icon)).resize(96, 96).jpeg({ quality: 90 }).toFile(path.join(out, 'thumb.jpg'));
  console.log('Created cover, invitation and app icons in ' + out);
})();
