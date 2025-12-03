import sharp from 'sharp';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.join(__dirname, '..');

// Source SVG
const sourceSvg = path.join(projectRoot, 'public', 'favicon', 'source.svg');

// Output configurations
const outputs = [
  { name: 'favicon-16x16.png', size: 16, dest: 'public/favicon' },
  { name: 'favicon-32x32.png', size: 32, dest: 'public/favicon' },
  { name: 'favicon-48x48.png', size: 48, dest: 'public/favicon' },
  { name: 'apple-icon.png', size: 180, dest: 'app' },
  { name: 'android-chrome-192x192.png', size: 192, dest: 'public/favicon' },
  { name: 'android-chrome-512x512.png', size: 512, dest: 'public/favicon' },
];

async function generateFavicons() {
  console.log('🌱 Generating favicon PNG variants...\n');

  // Read source SVG
  const svgBuffer = fs.readFileSync(sourceSvg);

  for (const output of outputs) {
    const outputPath = path.join(projectRoot, output.dest, output.name);

    try {
      await sharp(svgBuffer)
        .resize(output.size, output.size, {
          fit: 'contain',
          background: { r: 0, g: 0, b: 0, alpha: 0 }
        })
        .png()
        .toFile(outputPath);

      const stats = fs.statSync(outputPath);
      const sizeKB = (stats.size / 1024).toFixed(2);
      console.log(`✅ ${output.name.padEnd(30)} ${output.size}x${output.size}  ${sizeKB} KB`);
    } catch (error) {
      console.error(`❌ Failed to generate ${output.name}:`, error.message);
    }
  }

  console.log('\n🎉 Favicon generation complete!');
  console.log('\nNext steps:');
  console.log('1. Run: node scripts/generate-favicon-ico.mjs');
  console.log('2. Update app/layout.tsx with metadata');
}

generateFavicons().catch(console.error);
