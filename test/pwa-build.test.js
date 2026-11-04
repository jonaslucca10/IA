'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const publishedFiles = [
  'index.html',
  'styles.css',
  'app.js',
  'local-engine.js',
  'manifest.webmanifest',
  'service-worker.js',
  'icon.svg',
];

test('build includes every same-origin file required for an offline install', () => {
  execFileSync(process.execPath, ['build.js'], { cwd: root, stdio: 'pipe' });

  for (const file of publishedFiles) {
    const source = fs.readFileSync(path.join(root, file));
    const published = fs.readFileSync(path.join(root, 'dist', file));
    assert.deepEqual(published, source, `${file} should be copied unchanged to dist/`);
  }

  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'dist/manifest.webmanifest'), 'utf8'));
  assert.equal(manifest.lang, 'pt-BR');
  assert.equal(manifest.display, 'standalone');
  assert.ok(manifest.icons.some((icon) => icon.src === 'icon.svg'));

  const app = fs.readFileSync(path.join(root, 'dist/app.js'), 'utf8');
  const worker = fs.readFileSync(path.join(root, 'dist/service-worker.js'), 'utf8');
  assert.match(app, /registerServiceWorker/);
  assert.match(worker, /cache\.addAll/);
  assert.match(worker, /requestUrl\.origin !== self\.location\.origin/);
});
