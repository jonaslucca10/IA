'use strict';

const fs = require('node:fs');
const path = require('node:path');

const root = __dirname;
const outputDirectory = path.join(root, 'dist');
const staticFiles = [
  'index.html',
  'styles.css',
  'app.js',
  'local-engine.js',
  'manifest.webmanifest',
  'service-worker.js',
  'icon.svg',
];

fs.rmSync(outputDirectory, { recursive: true, force: true });
fs.mkdirSync(outputDirectory, { recursive: true });

for (const file of staticFiles) {
  const source = path.join(root, file);
  if (!fs.statSync(source).isFile()) throw new Error(`Arquivo de publicação não encontrado: ${file}`);
  fs.copyFileSync(source, path.join(outputDirectory, file));
}

console.log(`Versão offline pronta: ${staticFiles.length} arquivos em dist/.`);
