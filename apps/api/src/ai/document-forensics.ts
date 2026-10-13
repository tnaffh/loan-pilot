/**
 * Best-effort file metadata that helps spot edited documents — the model cannot
 * see a PDF's metadata, only its rendered pages and text. Nothing here is proof:
 * it is passed to the reviewer as hints to weigh.
 *
 *  - The PDF Info dictionary / XMP: which software produced the file, when it
 *    was created and last modified. A bank statement "produced" by a word
 *    processor or an online PDF editor, or modified after it was created,
 *    deserves a closer look.
 *  - Saved revisions: each incremental save appends a new `%%EOF`. Statements
 *    downloaded from a bank have one (two when linearized for the web); more
 *    means the file was changed after it was produced.
 *  - Editor traces: names of editing tools in the file (also the EXIF
 *    "Software" tag of a photo).
 *
 * Metadata inside compressed object streams is not decoded, so absent fields
 * mean "not found", never "clean".
 */

export interface DocumentForensics {
  producer: string | null;
  creator: string | null;
  createdAt: string | null;
  modifiedAt: string | null;
  /** Revisions saved after the original (PDF only); null when not a PDF. */
  savedRevisions: number | null;
  editorTraces: string[];
}

/** Tools that edit or fabricate documents. Banks and payroll systems don't produce with these. */
const EDITORS = [
  'Photoshop',
  'GIMP',
  'Canva',
  'iLovePDF',
  'Smallpdf',
  'Sejda',
  'PDFescape',
  'PDF-XChange',
  'PDFelement',
  'Wondershare',
  'Foxit PhantomPDF',
  'Foxit PDF Editor',
  'Nitro Pro',
  'Microsoft Word',
  'Microsoft® Word',
  'LibreOffice',
  'OpenOffice',
  'WPS Office',
  'Google Docs',
  'Inkscape',
  'Snapseed',
  'PicsArt',
  'Pixlr',
  'Paint.NET',
  'Acrobat Pro',
  'Adobe Acrobat Pro',
  'PDF Candy',
  'Soda PDF',
  'Xodo',
];

/** Decode a PDF literal string body: escapes and octal codes. */
const decodeLiteral = (raw: string): string =>
  raw
    .replace(/\\([nrtbf()\\])/g, (_match, ch: string) =>
      ch === 'n'
        ? '\n'
        : ch === 'r'
          ? '\r'
          : ch === 't'
            ? '\t'
            : ch === 'b' || ch === 'f'
              ? ''
              : ch,
    )
    .replace(/\\([0-7]{1,3})/g, (_match, octal: string) => String.fromCharCode(parseInt(octal, 8)));

/** Decode a PDF hex string, honouring a UTF-16BE byte-order mark. */
const decodeHex = (hex: string): string => {
  const bytes = Buffer.from(hex.replace(/\s+/g, ''), 'hex');

  if (bytes[0] === 0xfe && bytes[1] === 0xff) {
    const swapped = Buffer.from(bytes.subarray(2));

    swapped.swap16();

    return swapped.toString('utf16le');
  }

  return bytes.toString('latin1');
};

/** Strip control characters a hostile file could use to break the prompt layout. */
const clean = (value: string): string | null => {
  const text = Array.from(value, (ch) => {
    const code = ch.charCodeAt(0);

    return code < 0x20 || code === 0x7f ? ' ' : ch;
  })
    .join('')
    .trim()
    .slice(0, 120);

  return text.length > 0 ? text : null;
};

/** The last value of an Info-dictionary key (the newest revision wins). */
/** A PDF string token: a (literal) or a <hex> string. */
const STRING_TOKEN = '\\(((?:\\\\.|[^\\\\)])*)\\)|<([0-9A-Fa-f\\s]*)>';

const decodeToken = (literal: string | undefined, hex: string | undefined): string | null =>
  clean(literal != null ? decodeLiteral(literal) : decodeHex(hex ?? ''));

/**
 * The last value of an Info-dictionary key (the newest revision wins). The value
 * may be inline (`/Producer (Foo)`) or an indirect reference to another object
 * (`/Producer 11 0 R` … `11 0 obj (Foo) endobj`), which many generators use.
 */
const infoValue = (text: string, key: string): string | null => {
  const pattern = new RegExp(`/${key}\\s*(?:${STRING_TOKEN}|(\\d+)\\s+(\\d+)\\s+R)`, 'g');
  const matches = [...text.matchAll(pattern)];
  const last = matches[matches.length - 1];

  if (!last) {
    return null;
  }

  if (last[3] == null) {
    return decodeToken(last[1], last[2]);
  }

  const target = new RegExp(`(?:^|\\s)${last[3]}\\s+${last[4]}\\s+obj\\s*(?:${STRING_TOKEN})`, 'g');
  const resolved = [...text.matchAll(target)].pop();

  return resolved ? decodeToken(resolved[1], resolved[2]) : null;
};

const xmpValue = (text: string, tag: string): string | null => {
  const match = new RegExp(`<${tag}>([^<]{1,200})</${tag}>`).exec(text);

  return match?.[1] ? clean(match[1]) : null;
};

/** PDF date `D:20260915103000+02'00'` → `2026-09-15 10:30:00 +02:00`. */
export const formatPdfDate = (value: string | null): string | null => {
  if (!value) return null;
  const match =
    /^D?:?(\d{4})(\d{2})?(\d{2})?(\d{2})?(\d{2})?(\d{2})?([Zz+-])?(\d{2})?'?(\d{2})?/.exec(value);

  if (!match) return value;
  const [
    ,
    year,
    month = '01',
    day = '01',
    hour = '00',
    minute = '00',
    second = '00',
    sign,
    tzH,
    tzM,
  ] = match;
  const zone =
    sign === 'Z' || sign === 'z' ? ' UTC' : sign && tzH ? ` ${sign}${tzH}:${tzM ?? '00'}` : '';

  return `${year}-${month}-${day} ${hour}:${minute}:${second}${zone}`;
};

export const inspectDocument = (buffer: Buffer, mimeType: string): DocumentForensics => {
  const text = buffer.toString('latin1');
  const isPdf = mimeType === 'application/pdf' || text.startsWith('%PDF');

  const producer = isPdf ? (infoValue(text, 'Producer') ?? xmpValue(text, 'pdf:Producer')) : null;
  const creator = isPdf ? (infoValue(text, 'Creator') ?? xmpValue(text, 'xmp:CreatorTool')) : null;
  const createdAt = isPdf
    ? (formatPdfDate(infoValue(text, 'CreationDate')) ?? xmpValue(text, 'xmp:CreateDate'))
    : null;
  const modifiedAt = isPdf
    ? (formatPdfDate(infoValue(text, 'ModDate')) ?? xmpValue(text, 'xmp:ModifyDate'))
    : null;

  const savedRevisions = isPdf
    ? (() => {
        const eofs = (text.match(/%%EOF/g) ?? []).length;
        const linearized = /\/Linearized\s/.test(text.slice(0, 2048));

        return Math.max(0, eofs - 1 - (linearized ? 1 : 0));
      })()
    : null;

  // PDFs: search the producer fields; images: the EXIF/XMP header region.
  const haystack = isPdf
    ? [producer, creator, xmpValue(text, 'xmp:CreatorTool')].filter(Boolean).join(' ')
    : text.slice(0, 256 * 1024);
  const lower = haystack.toLowerCase();
  const editorTraces = EDITORS.filter((name) => lower.includes(name.toLowerCase())).filter(
    // Keep the most specific name ("Adobe Acrobat Pro" over "Acrobat Pro").
    (name, _index, found) =>
      !found.some((other) => other !== name && other.toLowerCase().includes(name.toLowerCase())),
  );

  return { producer, creator, createdAt, modifiedAt, savedRevisions, editorTraces };
};

/** A one-line description for the prompt. */
export const describeForensics = (forensics: DocumentForensics): string => {
  const parts = [
    forensics.producer ? `producer "${forensics.producer}"` : null,
    forensics.creator ? `creator "${forensics.creator}"` : null,
    forensics.createdAt ? `created ${forensics.createdAt}` : null,
    forensics.modifiedAt ? `modified ${forensics.modifiedAt}` : null,
    forensics.savedRevisions != null
      ? `${forensics.savedRevisions} revision(s) saved after the original`
      : null,
    forensics.editorTraces.length > 0
      ? `editing-software traces: ${forensics.editorTraces.join(', ')}`
      : null,
  ].filter(Boolean);

  return parts.length > 0 ? parts.join('; ') : 'no metadata found';
};
