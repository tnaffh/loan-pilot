import { AI_REVIEW_CHECKS } from '@loan-pilot/domain';
import { REVIEW_SYSTEM_PROMPT, buildReviewContent } from './review-prompt';

const forensics = {
  producer: null,
  creator: null,
  createdAt: null,
  modifiedAt: null,
  savedRevisions: 0,
  editorTraces: [],
};

describe('review prompt', () => {
  it('lists every checklist key in the (date-free, cacheable) system prompt', () => {
    for (const check of AI_REVIEW_CHECKS) {
      expect(REVIEW_SYSTEM_PROMPT).toContain(check.key);
    }

    expect(REVIEW_SYSTEM_PROMPT).not.toMatch(/\d{4}-\d{2}-\d{2}/);
  });

  it('puts each document after its header and the case facts last', () => {
    const parts = buildReviewContent({
      subject: 'a new loan application',
      reviewDate: new Date('2026-10-13T09:00:00Z'),
      facts: [
        {
          heading: 'Applicant',
          lines: [
            ['Name', 'Helena N'],
            ['Employer', null],
          ],
        },
      ],
      systemFindings: ['Required document not uploaded: Latest payslip.'],
      documents: [
        {
          id: 'doc-1',
          kind: 'bank_statement',
          fileName: 'statement.pdf',
          uploadedAt: new Date('2026-10-10T00:00:00Z'),
          mimeType: 'application/pdf',
          data: Buffer.from('%PDF'),
          forensics,
        },
        {
          id: 'doc-2',
          kind: 'id_document',
          fileName: 'id.jpg',
          uploadedAt: new Date('2026-10-10T00:00:00Z'),
          mimeType: 'image/jpeg',
          data: Buffer.from('jpg'),
          forensics: { ...forensics, savedRevisions: null },
        },
      ],
      skipped: [{ fileName: 'scan.heic', reason: 'file type image/heic is not supported' }],
    });

    expect(parts.map((part) => part.type)).toEqual(['text', 'pdf', 'text', 'image', 'text']);
    const header = parts[0];

    expect(header?.type === 'text' && header.text).toContain('id: doc-1');
    const closing = parts[4];
    const text = closing?.type === 'text' ? closing.text : '';

    expect(text).toContain('Review date: 2026-10-13');
    expect(text).toContain('- Name: Helena N');
    expect(text).not.toContain('Employer');
    expect(text).toContain('Required document not uploaded');
    expect(text).toContain('scan.heic');
  });
});
