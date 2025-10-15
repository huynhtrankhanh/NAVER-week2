#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import * as esbuild from 'esbuild';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function build() {
  console.log('🚀 Starting single-serve bundle build...\n');

  // Step 1: Build the client
  console.log('📦 Building client...');
  const { execSync } = await import('child_process');
  execSync('npm --prefix client run build', { stdio: 'inherit', cwd: __dirname });
  console.log('✅ Client built successfully\n');

  // Step 2: Read built client files
  console.log('📖 Reading built client files...');
  const distPath = path.join(__dirname, 'client', 'dist');
  const indexHtml = fs.readFileSync(path.join(distPath, 'index.html'), 'utf-8');
  
  // Find CSS and JS files
  const assetsPath = path.join(distPath, 'assets');
  const files = fs.readdirSync(assetsPath);
  const cssFile = files.find(f => f.endsWith('.css'));
  const jsFile = files.find(f => f.endsWith('.js'));

  if (!cssFile || !jsFile) {
    throw new Error('Could not find built CSS or JS files in dist/assets');
  }

  const cssContent = fs.readFileSync(path.join(assetsPath, cssFile), 'utf-8');
  const jsContent = fs.readFileSync(path.join(assetsPath, jsFile), 'utf-8');
  
  console.log(`✅ Found CSS: ${cssFile}`);
  console.log(`✅ Found JS: ${jsFile}\n`);

  // Step 3: Create bundled entry with embedded content
  console.log('🔧 Creating bundled entry file...');
  const bundleEntryTemplate = fs.readFileSync(path.join(__dirname, 'bundle-entry.js'), 'utf-8');
  
  // Use base64 encoding to avoid escaping issues
  const indexHtmlBase64 = Buffer.from(indexHtml).toString('base64');
  const cssContentBase64 = Buffer.from(cssContent).toString('base64');
  const jsContentBase64 = Buffer.from(jsContent).toString('base64');

  const bundleEntry = bundleEntryTemplate
    .replace("'__INDEX_HTML_BASE64__'", `'${indexHtmlBase64}'`)
    .replace("'__CSS_CONTENT_BASE64__'", `'${cssContentBase64}'`)
    .replace("'__JS_CONTENT_BASE64__'", `'${jsContentBase64}'`)
    .replace("'__CSS_FILENAME__'", `'${cssFile}'`)
    .replace("'__JS_FILENAME__'", `'${jsFile}'`);

  const tempEntryPath = path.join(__dirname, '.bundle-entry-temp.js');
  fs.writeFileSync(tempEntryPath, bundleEntry);
  console.log('✅ Bundled entry file created\n');

  // Step 4: Use esbuild to bundle everything
  console.log('📦 Bundling with esbuild...');
  
  try {
    await esbuild.build({
      entryPoints: [tempEntryPath],
      bundle: true,
      platform: 'node',
      target: 'node18',
      format: 'cjs',
      outfile: path.join(__dirname, 'single-serve.js'),
      banner: {
        js: '#!/usr/bin/env node\n'
      },
      // Bundle everything except Node.js built-ins
      external: [],
      minify: false,
      sourcemap: false,
      mainFields: ['main', 'module'],
      treeShaking: true
    });
  } catch (err) {
    console.error('❌ Bundling failed:', err);
    throw err;
  } finally {
    // Clean up temp file
    if (fs.existsSync(tempEntryPath)) {
      fs.unlinkSync(tempEntryPath);
    }
  }

  const outputPath = path.join(__dirname, 'single-serve.js');
  fs.chmodSync(outputPath, '755');

  console.log('✅ esbuild bundling complete\n');
  console.log(`🎉 Single-serve bundle created at: ${outputPath}`);
  
  const stats = fs.statSync(outputPath);
  console.log(`📊 Bundle size: ${(stats.size / 1024).toFixed(2)} KB`);
  console.log('\n✨ Done! Run with: node single-serve.js');
}

build().catch(err => {
  console.error('❌ Build failed:', err);
  process.exit(1);
});
