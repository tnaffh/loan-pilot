import { Test } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { DocumentKind } from '@loan-pilot/domain';
import { PrismaService } from '../prisma/prisma.service';
import { DocumentsService } from './documents.service';
import { StorageService } from './storage.service';

const profileDoc = (id: string, url: string, kind: string = DocumentKind.BankStatement) => ({
  id,
  kind,
  url,
  fileName: `${id}.pdf`,
  mimeType: 'application/pdf',
  sizeBytes: 100,
  borrowerId: 'bor1',
  applicationId: null,
  uploadedAt: new Date('2026-10-20T00:00:00Z'),
});

describe('DocumentsService — application documents', () => {
  const documentFindMany = jest.fn();
  const documentFindFirst = jest.fn();
  const prismaMock = {
    loanApplication: {
      findFirst: jest.fn().mockResolvedValue({ id: 'app1', idNumber: '90010100123' }),
    },
    borrower: { findFirst: jest.fn().mockResolvedValue({ id: 'bor1' }) },
    document: {
      findMany: documentFindMany,
      findFirst: documentFindFirst,
      createMany: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
  };
  let service: DocumentsService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [
        DocumentsService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: StorageService, useValue: {} },
      ],
    }).compile();

    service = moduleRef.get(DocumentsService);
  });

  it('lists the profile’s supporting documents and flags ones already attached', async () => {
    documentFindMany
      .mockResolvedValueOnce([
        profileDoc('s1', 'documents/s1.pdf'),
        profileDoc('s2', 'documents/s2.pdf'),
        profileDoc('sig', 'documents/sig.png', DocumentKind.Signature),
      ])
      .mockResolvedValueOnce([{ url: 'documents/s1.pdf' }]);

    const options = await service.profileDocumentsForApplication('t1', 'app1');

    expect(options.map((option) => [option.id, option.attached])).toEqual([
      ['s1', true],
      ['s2', false],
    ]);
  });

  it('attaches profile files as application rows sharing the stored file, once', async () => {
    documentFindMany
      .mockResolvedValueOnce([
        profileDoc('s1', 'documents/s1.pdf'),
        profileDoc('s2', 'documents/s2.pdf'),
      ])
      .mockResolvedValueOnce([{ url: 'documents/s1.pdf' }]);

    const result = await service.attachProfileDocuments('t1', 'app1', ['s1', 's2']);

    expect(result).toEqual({ attached: 1 });
    expect(prismaMock.document.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          applicationId: 'app1',
          url: 'documents/s2.pdf',
          kind: 'bank_statement',
        }),
      ],
    });
  });

  it('refuses documents that are not on this applicant’s profile', async () => {
    documentFindMany.mockResolvedValueOnce([]).mockResolvedValueOnce([]);

    await expect(service.attachProfileDocuments('t1', 'app1', ['other'])).rejects.toThrow(
      NotFoundException,
    );
  });

  it('refuses to attach when the applicant has no borrower profile', async () => {
    prismaMock.borrower.findFirst.mockResolvedValueOnce(null);

    await expect(service.attachProfileDocuments('t1', 'app1', ['s1'])).rejects.toThrow(
      BadRequestException,
    );
  });

  it('only unlinks a file that also belongs to the profile; deletes an application-only one', async () => {
    documentFindFirst.mockResolvedValueOnce({
      ...profileDoc('d1', 'documents/d1.pdf'),
      applicationId: 'app1',
    });
    await service.removeFromApplication('t1', 'app1', 'd1');

    expect(prismaMock.document.update).toHaveBeenCalledWith({
      where: { id: 'd1' },
      data: { applicationId: null },
    });

    documentFindFirst.mockResolvedValueOnce({
      ...profileDoc('d2', 'documents/d2.pdf'),
      borrowerId: null,
      applicationId: 'app1',
    });
    await service.removeFromApplication('t1', 'app1', 'd2');

    expect(prismaMock.document.delete).toHaveBeenCalledWith({ where: { id: 'd2' } });
  });

  it('re-labels supporting documents but never a signature', async () => {
    documentFindFirst.mockResolvedValueOnce({
      ...profileDoc('d1', 'documents/d1.pdf'),
      applicationId: 'app1',
    });
    await service.updateApplicationDocumentKind('t1', 'app1', 'd1', DocumentKind.Payslip);

    expect(prismaMock.document.update).toHaveBeenCalledWith({
      where: { id: 'd1' },
      data: { kind: DocumentKind.Payslip },
    });

    documentFindFirst.mockResolvedValueOnce({
      ...profileDoc('sig', 'documents/sig.png', DocumentKind.Signature),
      applicationId: 'app1',
    });
    await expect(
      service.updateApplicationDocumentKind('t1', 'app1', 'sig', DocumentKind.Payslip),
    ).rejects.toThrow(BadRequestException);
  });
});
