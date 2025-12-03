import pngToIco from 'png-to-ico';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.join(__dirname, '..');

async function generateFaviconIco() {
  console.log('🌱 Generating favicon.ico from PNG files...\n');

  const pngFiles = [
    path.join(projectRoot, 'public', 'favicon', 'favicon-16x16.png'),
    path.join(projectRoot, 'public', 'favicon', 'favicon-32x32.png'),
    path.join(projectRoot, 'public', 'favicon', 'favicon-48x48.png'),
  ];

  const outputPath = path.join(projectRoot, 'app', 'favicon.ico');

  try {
    // Read all PNG files
    const buffers = pngFiles.map(file => fs.readFileSync(file));

    // Convert to ICO
    const icoBuffer = await pngToIco(buffers);

    // Write ICO file
    fs.writeFileSync(outputPath, icoBuffer);

    const stats = fs.statSync(outputPath);
    const sizeKB = (stats.size / 1024).toFixed(2);

    console.log(`✅ favicon.ico created successfully!`);
    console.log(`   Location: app/favicon.ico`);
    console.log(`   Size: ${sizeKB} KB`);
    console.log(`   Resolutions: 16x16, 32x32, 48x48\n`);

    console.log('🎉 Favicon.ico generation complete!');
    console.log('\nNext step: Update app/layout.tsx with metadata');
  } catch (error) {
    console.error('❌ Failed to generate favicon.ico:', error.message);
    process.exit(1);
  }
}

generateFaviconIco().catch(console.error);
