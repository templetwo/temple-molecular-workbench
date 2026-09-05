import sharp from 'sharp';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';

const mark = resolve('public/temple-lab-mark.svg');
await sharp(mark).resize(1024, 1024).png().toFile('public/temple-lab-mark.png');
await sharp('public/temple-lab-logo.svg').resize(2400, 560).png().toFile('public/temple-lab-logo.png');
if (process.platform === 'darwin') {
  const temporary = await mkdtemp(join(tmpdir(), 'temple-icons-'));
  try {
    const iconset = join(temporary, 'AppIcon.iconset');
    await mkdir(iconset);
    await mkdir('packaging/macos', { recursive: true });
    for (const size of [16, 32, 128, 256, 512]) {
      await sharp(mark).resize(size, size).png().toFile(join(iconset, `icon_${size}x${size}.png`));
      await sharp(mark).resize(size * 2, size * 2).png().toFile(join(iconset, `icon_${size}x${size}@2x.png`));
    }
    execFileSync('/usr/bin/iconutil', ['--convert', 'icns', iconset, '--output', resolve('packaging/macos/AppIcon.icns')]);
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
}
console.log('Temple Lab logo assets generated.');
