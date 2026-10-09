import { describe, expect, it } from 'vitest';
import fixtures from '../fixtures/pdf-password-fixtures.json';
import { inspectPdf, splicePdfs } from '../../src/tools/pdf/pdf-engine';

describe('PDF-R03 protected modification refusal', () => {
  for (const name of ['owned-aes256.pdf', 'owned-aes128.pdf', 'owned-permissions-only.pdf']) {
    it(`PDF-R03 refuses modifying ${name} and preserves encrypted source bytes`, async () => {
      const entry = fixtures.files.find((file) => file.name === name)!;
      const bytes = new Uint8Array(Buffer.from(entry.base64, 'base64')); const original = bytes.slice();
      await expect(inspectPdf(bytes)).rejects.toThrow(/encrypted/i);
      await expect(splicePdfs([{ bytes, flatten: true }])).rejects.toThrow(/encrypted/i);
      expect(bytes).toEqual(original);
    });
  }
});
