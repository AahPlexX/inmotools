// Registry wiring for archives & compression (F28-F30).

import {
  archiveBytesToBase64, buildTarBytes, buildTarGzBytes, buildZipBytes, extractArchive,
  guessMime, hexDump, type ArchiveEntry,
} from './archives-engine';
import { registerConverter, baseName, bytesArtifact, textArtifact } from './transcode-engine';

const singleEntry = (entries: ArchiveEntry[]): ArchiveEntry => {
  if (entries.length === 0) throw new Error('The archive is empty.');
  if (entries.length === 1) return entries[0];
  throw new Error(`The archive contains ${entries.length} entries. Choose the ZIP target to repack all entries instead.`);
};

const entryFileName = (archiveName: string, entry: ArchiveEntry): string => {
  const leaf = entry.name.split('/').filter(Boolean).pop();
  return leaf && leaf.length > 0 ? leaf : `${baseName(archiveName)}.bin`;
};

export function registerArchiveConverters(): void {
  const archiveSources = ['zip', 'tar', 'tar-gz', 'tar-bz2', 'seven-zip'] as const;

  for (const source of archiveSources) {
    registerConverter(source, 'binary', `Unpack ${source === 'seven-zip' ? '7z' : source.toUpperCase()} to its contained file`, async (input) => {
      const entries = await extractArchive(input.bytes, source);
      const entry = singleEntry(entries);
      const name = entryFileName(input.fileName, entry);
      return [bytesArtifact(name, entry.data, guessMime(name, entry.data))];
    });

    registerConverter(source, 'zip', `Repack ${source === 'seven-zip' ? '7z' : source.toUpperCase()} entries into a ZIP archive`, async (input) => {
      const entries = await extractArchive(input.bytes, source);
      if (entries.length === 0) throw new Error('The archive is empty.');
      return [bytesArtifact(`${baseName(input.fileName)}.zip`, buildZipBytes(entries), 'application/zip')];
    });
  }

  registerConverter('zip', 'tar', 'Repack ZIP entries into a TAR archive', async (input) => {
    const entries = await extractArchive(input.bytes, 'zip');
    if (entries.length === 0) throw new Error('The archive is empty.');
    return [bytesArtifact(`${baseName(input.fileName)}.tar`, buildTarBytes(entries), 'application/x-tar')];
  });

  registerConverter('zip', 'tar-gz', 'Repack ZIP entries into a gzip-compressed TAR', async (input) => {
    const entries = await extractArchive(input.bytes, 'zip');
    if (entries.length === 0) throw new Error('The archive is empty.');
    return [bytesArtifact(`${baseName(input.fileName)}.tar.gz`, buildTarGzBytes(entries), 'application/gzip')];
  });

  registerConverter('tar', 'tar-gz', 'Compress a TAR archive with gzip', async (input) => {
    const entries = await extractArchive(input.bytes, 'tar');
    if (entries.length === 0) throw new Error('The archive is empty.');
    return [bytesArtifact(`${baseName(input.fileName)}.tar.gz`, buildTarGzBytes(entries), 'application/gzip')];
  });

  registerConverter('tar-gz', 'tar', 'Decompress a TAR.GZ archive to plain TAR', async (input) => {
    const entries = await extractArchive(input.bytes, 'tar-gz');
    if (entries.length === 0) throw new Error('The archive is empty.');
    return [bytesArtifact(`${baseName(input.fileName)}.tar`, buildTarBytes(entries), 'application/x-tar')];
  });

  // --- F30: binary -> base64 / hex / data URI ---------------------------------
  registerConverter('binary', 'base64', 'Encode the file as Base64 text', async (input) => {
    return [textArtifact(`${baseName(input.fileName)}.b64.txt`, archiveBytesToBase64(input.bytes), 'text/plain;charset=utf-8')];
  });
  registerConverter('binary', 'hex', 'Produce a canonical hex dump', async (input) => {
    return [textArtifact(`${baseName(input.fileName)}.hex.txt`, hexDump(input.bytes), 'text/plain;charset=utf-8')];
  });
  registerConverter('binary', 'data-uri', 'Encode the file as an inline data: URI', async (input) => {
    const mime = guessMime(input.fileName, input.bytes);
    return [textArtifact(`${baseName(input.fileName)}.uri.txt`, `data:${mime};base64,${archiveBytesToBase64(input.bytes)}`, 'text/plain;charset=utf-8')];
  });

  // --- F30 reverse: base64 text back into bytes -------------------------------
  const decodeBase64 = (input: { text: () => string }): Uint8Array => {
    const cleaned = input.text().replace(/^data:[^;]+;base64,/, '').replace(/\s+/g, '');
    if (!/^[A-Za-z0-9+/]*={0,2}$/.test(cleaned)) throw new Error('Input is not valid Base64.');
    const binary = atob(cleaned);
    const out = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i);
    return out;
  };

  registerConverter('base64', 'binary', 'Decode Base64 text back to the original file', async (input) => {
    const bytes = decodeBase64(input);
    return [bytesArtifact(`${baseName(input.fileName.replace(/\.(b64|uri)\.txt$/i, ''))}.bin`, bytes, guessMime(input.fileName, bytes))];
  });
  registerConverter('base64', 'txt', 'Decode Base64 text as UTF-8 text', async (input) => {
    const bytes = decodeBase64(input);
    return [textArtifact(`${baseName(input.fileName)}.txt`, new TextDecoder().decode(bytes), 'text/plain;charset=utf-8')];
  });
  registerConverter('base64', 'data-uri', 'Wrap Base64 content in a data: URI', async (input) => {
    const cleaned = input.text().replace(/^data:[^;]+;base64,/, '').replace(/\s+/g, '');
    if (!/^[A-Za-z0-9+/]*={0,2}$/.test(cleaned)) throw new Error('Input is not valid Base64.');
    return [textArtifact(`${baseName(input.fileName)}.uri.txt`, `data:application/octet-stream;base64,${cleaned}`, 'text/plain;charset=utf-8')];
  });

  registerConverter('rar', 'binary', 'Unpack RAR to its contained file (browser only)', async (input) => {
    const entries = await extractArchive(input.bytes, 'seven-zip');
    const entry = singleEntry(entries);
    const name = entryFileName(input.fileName, entry);
    return [bytesArtifact(name, entry.data, guessMime(name, entry.data))];
  });
}
