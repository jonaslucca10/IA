const fs = require('node:fs');
const path = require('node:path');

const outputDirectory = path.join(__dirname, 'dist');
const staticFiles = ['index.html', 'styles.css', 'app.js', 'local-engine.js'];

fs.rmSync(outputDirectory, { recursive: true, force: true });
fs.mkdirSync(outputDirectory, { recursive: true });

for (const file of staticFiles) {
  fs.copyFileSync(path.join(__dirname, file), path.join(outputDirectory, file));
}

console.log(`Prepared ${staticFiles.length} static files in dist/.`);
