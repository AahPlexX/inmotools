import { copyFile, mkdir, rm } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const source = resolve(root, 'node_modules/libarchive.js/dist');
const destination = resolve(root, 'public/libarchive.js/dist');

const copyLibarchiveWorker = async () => {
  await rm(destination, { recursive: true, force: true });
  await mkdir(destination, { recursive: true });
  await copyFile(resolve(source, 'worker-bundle.js'), resolve(destination, 'worker-bundle.js'));
};

await copyLibarchiveWorker();
