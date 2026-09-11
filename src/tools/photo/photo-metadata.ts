import type { PhotoExportMetadata, PhotoOutputMime } from './photo-types';

const MIME_EXTENSIONS: Record<PhotoOutputMime, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

function escapeXml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function textElement(name: string, value?: string | number): string {
  if (value === undefined || value === null || value === '') return '';
  return `<${name}>${escapeXml(String(value))}</${name}>`;
}

function bagElement(name: string, values?: string[]): string {
  const cleaned = values?.map((value) => value.trim()).filter(Boolean) ?? [];
  if (!cleaned.length) return '';
  return `<${name}><rdf:Bag>${cleaned.map((value) => `<rdf:li>${escapeXml(value)}</rdf:li>`).join('')}</rdf:Bag></${name}>`;
}

function seqElement(name: string, values?: string[]): string {
  const cleaned = values?.map((value) => value.trim()).filter(Boolean) ?? [];
  if (!cleaned.length) return '';
  return `<${name}><rdf:Seq>${cleaned.map((value) => `<rdf:li>${escapeXml(value)}</rdf:li>`).join('')}</rdf:Seq></${name}>`;
}

function altElement(name: string, value?: string): string {
  if (!value) return '';
  return `<${name}><rdf:Alt><rdf:li xml:lang="x-default">${escapeXml(value)}</rdf:li></rdf:Alt></${name}>`;
}

function formatGps(value: number | undefined): string | undefined {
  if (value === undefined || !Number.isFinite(value)) return undefined;
  return value.toFixed(7);
}

export function serializePhotoXmp(metadata: PhotoExportMetadata): string {
  const fields = [
    altElement('dc:title', metadata.title),
    textElement('photoshop:Headline', metadata.headline),
    altElement('dc:description', metadata.description),
    seqElement('dc:creator', metadata.creator ? [metadata.creator] : undefined),
    textElement('photoshop:Credit', metadata.credit),
    altElement('dc:rights', metadata.copyright),
    textElement('xmpRights:UsageTerms', metadata.usageTerms),
    textElement('photoshop:Source', metadata.source),
    textElement('photoshop:TransmissionReference', metadata.jobIdentifier),
    textElement('xmp:Rating', metadata.rating),
    textElement('xmp:Label', metadata.label),
    bagElement('dc:subject', metadata.keywords),
    bagElement('lr:hierarchicalSubject', metadata.hierarchicalKeywords),
    textElement('photoshop:City', metadata.city),
    textElement('photoshop:State', metadata.state),
    textElement('photoshop:Country', metadata.country),
    textElement('Iptc4xmpCore:Location', metadata.sublocation),
    textElement('exif:GPSLatitude', formatGps(metadata.latitude)),
    textElement('exif:GPSLongitude', formatGps(metadata.longitude)),
    textElement('exif:GPSAltitude', metadata.altitude),
    textElement('photoshop:DateCreated', metadata.creationDate),
    altElement('Iptc4xmpExt:AltTextAccessibility', metadata.altText),
    altElement('Iptc4xmpExt:ExtDescrAccessibility', metadata.extendedDescription),
    textElement('tiff:XResolution', metadata.ppi),
    textElement('tiff:YResolution', metadata.ppi),
    metadata.ppi ? '<tiff:ResolutionUnit>2</tiff:ResolutionUnit>' : '',
  ].filter(Boolean).join('');

  return `<?xpacket begin="\uFEFF" id="W5M0MpCehiHzreSzNTczkc9d"?>\n<x:xmpmeta xmlns:x="adobe:ns:meta/" x:xmptk="INMOTOOLS Photo Studio">\n<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">\n<rdf:Description rdf:about="" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:photoshop="http://ns.adobe.com/photoshop/1.0/" xmlns:xmp="http://ns.adobe.com/xap/1.0/" xmlns:xmpRights="http://ns.adobe.com/xap/1.0/rights/" xmlns:Iptc4xmpCore="http://iptc.org/std/Iptc4xmpCore/1.0/xmlns/" xmlns:Iptc4xmpExt="http://iptc.org/std/Iptc4xmpExt/2008-02-29/" xmlns:exif="http://ns.adobe.com/exif/1.0/" xmlns:tiff="http://ns.adobe.com/tiff/1.0/" xmlns:lr="http://ns.adobe.com/lightroom/1.0/">${fields}</rdf:Description>\n</rdf:RDF>\n</x:xmpmeta>\n<?xpacket end="w"?>`;
}

export function safePhotoFilename(sourceName: string, mime: PhotoOutputMime): string {
  const extension = MIME_EXTENSIONS[mime];
  const withoutExtension = sourceName.replace(/\.[^./\\]+$/, '') || 'photo';
  const safeStem = withoutExtension
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[. ]+$/g, '') || 'photo';
  return `${safeStem}-edited.${extension}`;
}

export function metadataHasLocation(metadata: PhotoExportMetadata): boolean {
  return [metadata.city, metadata.state, metadata.country, metadata.sublocation]
    .some((value) => Boolean(value?.trim()))
    || [metadata.latitude, metadata.longitude, metadata.altitude].some((value) => value !== undefined);
}

export function stripLocationMetadata(metadata: PhotoExportMetadata): PhotoExportMetadata {
  const {
    city: _city,
    state: _state,
    country: _country,
    sublocation: _sublocation,
    latitude: _latitude,
    longitude: _longitude,
    altitude: _altitude,
    ...rest
  } = metadata;
  return rest;
}
