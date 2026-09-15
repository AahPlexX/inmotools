import fs from 'node:fs';

const path = 'src/tools/pdf/PdfWorkspace.tsx';
let source = fs.readFileSync(path, 'utf8');
const before = '<PdfCanvas file={viewerItem.file} pageNumber={resolvedViewerPage} zoom={viewerZoomPercent / 100} />';
const after = '<PdfCanvas file={viewerItem.file} pageNumber={resolvedViewerPage} zoom={viewerZoomPercent / 100} onPageRequest={setViewerPage} />';

if (source.includes(after)) {
  console.log('PDF search navigation callback is already mounted.');
  process.exit(0);
}

const first = source.indexOf(before);
if (first < 0 || source.indexOf(before, first + before.length) >= 0) {
  throw new Error('Expected exactly one PdfCanvas viewer mount anchor.');
}

source = source.replace(before, after);
fs.writeFileSync(path, source);
console.log('Mounted PdfCanvas page-navigation callback.');
