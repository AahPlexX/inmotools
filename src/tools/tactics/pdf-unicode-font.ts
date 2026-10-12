import fontkit from '@pdf-lib/fontkit';
import type { PDFDocument, PDFFont } from 'pdf-lib';
import regularInline from './fonts/NotoSans-Regular.subset.ttf?inline';
import boldInline from './fonts/NotoSans-Bold.subset.ttf?inline';

export const MATCHBOARD_UNICODE_FONT_FAMILY = 'Noto Sans';
export const MATCHBOARD_UNICODE_FONT_POSTSCRIPT = 'NotoSans';
export const PDF_PAGE_TEXT_FALLBACK = '?';

export interface MatchboardUnicodeFonts {
  regular: PDFFont;
  bold: PDFFont;
  covered: (codePoint: number) => boolean;
}

function inlineFontBytes(inline: string, face: string): Uint8Array {
  const marker = 'base64,';
  const start = inline.indexOf(marker);
  if (start < 0) {
    throw new Error(`Matchboard ${face} font was not inlined into the PDF export chunk.`);
  }
  const binary = atob(inline.slice(start + marker.length));
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  if (bytes.length < 4 || bytes[0] !== 0 || bytes[1] !== 1 || bytes[2] !== 0 || bytes[3] !== 0) {
    throw new Error(`Matchboard ${face} font is not a TrueType file.`);
  }
  return bytes;
}

let byteCache: Promise<{ regular: Uint8Array; bold: Uint8Array; covered: Set<number> }> | null = null;

function loadFontBytes(): Promise<{ regular: Uint8Array; bold: Uint8Array; covered: Set<number> }> {
  byteCache ??= (async () => {
    const regular = inlineFontBytes(regularInline, 'regular');
    const bold = inlineFontBytes(boldInline, 'bold');
    const face = fontkit.create(regular);
    return { regular, bold, covered: new Set(face.characterSet) };
  })();
  return byteCache;
}

export async function embedMatchboardUnicodeFonts(pdf: PDFDocument): Promise<MatchboardUnicodeFonts> {
  pdf.registerFontkit(fontkit);
  const { regular, bold, covered } = await loadFontBytes();
  const regularFont = await pdf.embedFont(regular, { subset: true });
  const boldFont = await pdf.embedFont(bold, { subset: true });
  return {
    regular: regularFont,
    bold: boldFont,
    covered: (codePoint: number) => covered.has(codePoint),
  };
}
