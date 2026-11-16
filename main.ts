// SPDX-License-Identifier: MIT
// main.ts — hands the entry in. Copies game/ and screenshots/ from this
// repository into the output directory (MAKEFUN_OUTPUT_DIR, else /output)
// and writes /output/dossier.json with buildDossier from the kit library.
//
// It never deletes the output directory itself (rmSync on /output caused an
// EBUSY failure in an earlier round): only the game/ and screenshots/
// subdirectories inside it and dossier.json are replaced.

import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-threejs.ts';

const repoRoot = dirname(fileURLToPath(import.meta.url));
const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

const caps = {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 256 * 1024 },
  game_max_files: 993,
  game_max_bytes: 48 * 1024 * 1024,
  game_path_max_bytes: 1000,
};

mkdirSync(outDir, { recursive: true });

// Replace only the entry's own outputs inside outDir, never outDir itself.
for (const sub of ['game', 'screenshots']) {
  const p = join(outDir, sub);
  if (existsSync(p)) rmSync(p, { recursive: true, force: true });
}
const dossierPath = join(outDir, 'dossier.json');
if (existsSync(dossierPath)) rmSync(dossierPath, { force: true });

cpSync(join(repoRoot, 'game'), join(outDir, 'game'), { recursive: true });
cpSync(join(repoRoot, 'screenshots'), join(outDir, 'screenshots'), { recursive: true });

const dossier = buildDossier(outDir, caps);
writeFileSync(dossierPath, dossier);
console.log(`wrote ${dossierPath} (${dossier.length} bytes)`);
