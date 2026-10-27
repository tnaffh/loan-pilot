import { isPlaceholderId } from '@loan-pilot/domain';
import type { PrismaService } from '../prisma/prisma.service';

/**
 * The borrower an application belongs to: the tenant's borrower with the same ID
 * number (approval links to them the same way). Placeholder or blank IDs never
 * match — they aren't real identifiers.
 */
export const findApplicantBorrowerId = async (
  prisma: PrismaService,
  tenantId: string,
  idNumber: string,
): Promise<string | null> => {
  if (!idNumber || isPlaceholderId(idNumber)) {
    return null;
  }

  const borrower = await prisma.borrower.findFirst({
    where: { tenantId, idNumber },
    select: { id: true },
  });

  return borrower?.id ?? null;
};
