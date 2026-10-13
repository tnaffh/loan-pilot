import { describeForensics, formatPdfDate, inspectDocument } from './document-forensics';

const pdf = (body: string): Buffer => Buffer.from(`%PDF-1.7\n${body}`, 'latin1');

describe('inspectDocument', () => {
  it('reads the newest Info dictionary and counts revisions saved after the original', () => {
    const file = pdf(
      [
        "1 0 obj << /Producer (Bank Statements Engine) /CreationDate (D:20260901080000+02'00') >> endobj",
        'trailer << >>\n%%EOF',
        '9 0 obj << /Producer (iLovePDF) /ModDate (D:20261002141500Z) >> endobj',
        'trailer << >>\n%%EOF',
      ].join('\n'),
    );
    const result = inspectDocument(file, 'application/pdf');

    expect(result.producer).toBe('iLovePDF');
    expect(result.createdAt).toBe('2026-09-01 08:00:00 +02:00');
    expect(result.modifiedAt).toBe('2026-10-02 14:15:00 UTC');
    expect(result.savedRevisions).toBe(1);
    expect(result.editorTraces).toEqual(['iLovePDF']);
  });

  it('follows Info values stored as indirect object references', () => {
    const file = pdf(
      [
        '11 0 obj\n(PDFKit)\nendobj',
        '12 0 obj\n(D:20260918081500Z)\nendobj',
        '20 0 obj << /Producer 11 0 R /CreationDate 12 0 R >> endobj',
        '%%EOF',
      ].join('\n'),
    );
    const result = inspectDocument(file, 'application/pdf');

    expect(result.producer).toBe('PDFKit');
    expect(result.createdAt).toBe('2026-09-18 08:15:00 UTC');
  });

  it('does not count the second %%EOF of a linearized file as an edit', () => {
    const file = pdf('1 0 obj << /Linearized 1 >> endobj\n%%EOF\nbody\n%%EOF');

    expect(inspectDocument(file, 'application/pdf').savedRevisions).toBe(0);
  });

  it('decodes UTF-16 hex strings and escaped literals', () => {
    const hex = Buffer.concat([
      Buffer.from([0xfe, 0xff]),
      Buffer.from('\u0000W\u0000o\u0000r\u0000d', 'latin1'),
    ]).toString('hex');
    const file = pdf(`<< /Creator <${hex}> /Producer (Microsoft\\256 Word \\(2019\\)) >>\n%%EOF`);
    const result = inspectDocument(file, 'application/pdf');

    expect(result.creator).toBe('Word');
    expect(result.producer).toBe('Microsoft® Word (2019)');
    expect(result.editorTraces).toEqual(['Microsoft® Word']);
  });

  it('finds editor traces in an image header and has no PDF fields', () => {
    const image = Buffer.from('\xff\xd8\xff\xe1Exif\0\0Software\0Adobe Photoshop 25.0', 'latin1');
    const result = inspectDocument(image, 'image/jpeg');

    expect(result.savedRevisions).toBeNull();
    expect(result.editorTraces).toEqual(['Photoshop']);
  });

  it('describes a clean file plainly', () => {
    const result = inspectDocument(pdf('%%EOF'), 'application/pdf');

    expect(describeForensics(result)).toBe('0 revision(s) saved after the original');
  });
});

describe('formatPdfDate', () => {
  it('handles partial dates and passes through unknown formats', () => {
    expect(formatPdfDate('D:2026')).toBe('2026-01-01 00:00:00');
    expect(formatPdfDate('yesterday')).toBe('yesterday');
    expect(formatPdfDate(null)).toBeNull();
  });
});
