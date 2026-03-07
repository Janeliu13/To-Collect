#!/usr/bin/env node
/**
 * Makes black (and near-black) pixels in an image transparent.
 * Usage: node scripts/make-frame-transparent.mjs [input] [output]
 * Default: public/assets/webcam_frame_source.png -> public/assets/webcam_frame.png
 */
import sharp from 'sharp';
import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const inputPath = process.argv[2] || join(root, 'public/assets/webcam_frame_source.png');
const outputPath = process.argv[3] || join(root, 'public/assets/webcam_frame.png');

if (!existsSync(inputPath)) {
  console.error('Input not found:', inputPath);
  process.exit(1);
}

const THRESHOLD = 80; // Pixels with R,G,B all below this become transparent (removes black/dark interior)

const { data, info } = await sharp(inputPath)
  .ensureAlpha()
  .raw()
  .toBuffer({ resolveWithObject: true });

const channels = info.channels;
for (let i = 0; i < data.length; i += channels) {
  const r = data[i];
  const g = data[i + 1];
  const b = data[i + 2];
  if (r <= THRESHOLD && g <= THRESHOLD && b <= THRESHOLD) {
    data[i + 3] = 0; // set alpha to 0
  }
}

await sharp(Buffer.from(data), {
  raw: {
    width: info.width,
    height: info.height,
    channels: info.channels,
  },
})
  .png()
  .toFile(outputPath);

console.log('Written:', outputPath);
