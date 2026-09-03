import { copyFile, mkdir, rm } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const source = resolve(root, 'node_modules/pyodide');
const destination = resolve(root, 'public/pyodide');
const coreFiles = ['pyodide.asm.mjs', 'pyodide.asm.wasm', 'python_stdlib.zip', 'pyodide-lock.json'];

const copyPyodideCore = async () => {
  await rm(destination, { recursive: true, force: true });
  await mkdir(destination, { recursive: true });
  await Promise.all(coreFiles.map((file) => copyFile(resolve(source, file), resolve(destination, file))));
};

await copyPyodideCore();
