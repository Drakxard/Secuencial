import { cp, mkdir, rm } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const output = resolve(root, 'www');

await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
await Promise.all(['index.html', 'fondo.css', 'app.js'].map(file => cp(resolve(root, file), resolve(output, file))));
