import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { LoanProduct, Prisma, TenantSettings } from '@prisma/client';
import {
  MAX_MONTHLY_RATE,
  toCents,
  type FeeSettings,
  type FeeSettingsInput,
  type LenderIdentityInput,
  type LoanProductInput,
  type LoanType,
  type UpdateLoanProductInput,
} from '@loan-pilot/domain';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../documents/storage.service';
import { decodeDataUrl } from '../documents/data-url';

/** The business's identity for the header of generated loan agreements. */
export interface LenderIdentity {
  // Display name + town live on the Tenant record; logo is a resolved URL.
  name: string | null;
  town: string | null;
  logoUrl: string | null;
  legalName: string | null;
  namfisaLicenceNo: string | null;
  registrationNo: string | null;
  physicalAddress: string | null;
  postalAddress: string | null;
  contactPhone: string | null;
  contactEmail: string | null;
  website: string | null;
  // Who signs for the lender, with their signature / initials and the optional
  // custom stamp resolved to preview URLs (null until captured / uploaded). With
  // no custom stamp, documents carry a stamp drawn from the identity above.
  principalOfficerName: string | null;
  principalOfficerSignatureUrl: string | null;
  principalOfficerInitialsUrl: string | null;
  companyStampUrl: string | null;
}

/** The lender-side images embedded into signed documents — bytes, not URLs. */
export interface SigningAssets {
  officerName: string | null;
  officerSignaturePng: Buffer | null;
  officerInitialsPng: Buffer | null;
  /** A custom uploaded stamp, or null to draw the default one. */
  stampPng: Buffer | null;
}

/** The TenantSettings columns that hold a lender signing image (storage key). */
export type SigningImageField =
  | 'principalOfficerSignature'
  | 'principalOfficerInitials'
  | 'companyStamp';

/** pdfkit can only embed these, so the stamp upload is limited to them. */
const EMBEDDABLE_IMAGE_TYPES = new Set(['image/png', 'image/jpeg']);

/** A single calendar year's NAMFISA levy liability, for the annual remittance. */
export interface LevyYear {
  year: number;
  loanCount: number;
  levyCents: number;
  stampDutyCents: number;
}

export interface LevyReport {
  years: LevyYear[];
  totalLevyCents: number;
  totalStampDutyCents: number;
}

@Injectable()
export class SettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  /** Fetch the tenant's fee settings, creating the default row on first access. */
  async getFeeSettings(tenantId: string): Promise<TenantSettings> {
    const existing = await this.prisma.tenantSettings.findUnique({ where: { tenantId } });
    return existing ?? this.prisma.tenantSettings.create({ data: { tenantId } });
  }

  /** Fee settings in the domain shape (cents + fractions) used by loan pricing. */
  async resolveFeeSettings(tenantId: string): Promise<FeeSettings> {
    const s = await this.getFeeSettings(tenantId);
    return {
      namfisaLevyRate: s.namfisaLevyRate,
      stampDutyCents: s.stampDuty,
      insuranceRate: s.insuranceRate,
      insuranceFlatCents: s.insuranceFlat,
      monthlyRate: s.monthlyRate,
    };
  }

  /** Update the tenant's fee settings. `stampDuty`/`insuranceFlat` arrive in major N$. */
  updateFeeSettings(tenantId: string, input: FeeSettingsInput): Promise<TenantSettings> {
    const data = {
      namfisaLevyRate: input.namfisaLevyRate,
      stampDuty: toCents(input.stampDuty),
      insuranceRate: input.insuranceRate,
      insuranceFlat: toCents(input.insuranceFlat),
      ...(input.monthlyRate !== undefined
        ? { monthlyRate: Math.min(Math.max(input.monthlyRate, 0), MAX_MONTHLY_RATE) }
        : {}),
    };
    return this.prisma.tenantSettings.upsert({
      where: { tenantId },
      update: data,
      create: { tenantId, ...data },
    });
  }

  /** The business identity (as shown on generated loan agreements). */
  async getLenderIdentity(tenantId: string): Promise<LenderIdentity> {
    const [s, tenant] = await Promise.all([
      this.getFeeSettings(tenantId),
      this.prisma.tenant.findUnique({
        where: { id: tenantId },
        select: { name: true, town: true, logoUrl: true },
      }),
    ]);
    const [logoUrl, principalOfficerSignatureUrl, principalOfficerInitialsUrl, companyStampUrl] =
      await Promise.all([
        this.resolveImage(tenant?.logoUrl ?? null),
        this.resolveImage(s.principalOfficerSignature),
        this.resolveImage(s.principalOfficerInitials),
        this.resolveImage(s.companyStamp),
      ]);
    return {
      name: tenant?.name ?? null,
      town: tenant?.town ?? null,
      logoUrl,
      legalName: s.legalName,
      namfisaLicenceNo: s.namfisaLicenceNo,
      registrationNo: s.registrationNo,
      physicalAddress: s.physicalAddress,
      postalAddress: s.postalAddress,
      contactPhone: s.contactPhone,
      contactEmail: s.contactEmail,
      website: s.website,
      principalOfficerName: s.principalOfficerName,
      principalOfficerSignatureUrl,
      principalOfficerInitialsUrl,
      companyStampUrl,
    };
  }

  /**
   * The officer's signature and initials (and any custom stamp) read back as
   * bytes for embedding into a generated PDF. Each degrades to null when not
   * captured or unreadable, so documents still render — with blank lines to
   * sign by hand and the drawn default stamp.
   */
  async getSigningAssets(tenantId: string): Promise<SigningAssets> {
    const s = await this.getFeeSettings(tenantId);
    const [officerSignaturePng, officerInitialsPng, stampPng] = await Promise.all([
      this.storage.tryRead(s.principalOfficerSignature, 'principal officer signature'),
      this.storage.tryRead(s.principalOfficerInitials, 'principal officer initials'),
      this.storage.tryRead(s.companyStamp, 'company stamp'),
    ]);
    return { officerName: s.principalOfficerName, officerSignaturePng, officerInitialsPng, stampPng };
  }

  /** Store a drawn/photographed officer signature or initials (a PNG data-URL). */
  async saveSigningImage(
    tenantId: string,
    field: Exclude<SigningImageField, 'companyStamp'>,
    dataUrl: string,
  ): Promise<LenderIdentity> {
    const { key } = await this.storage.save({
      buffer: decodeDataUrl(dataUrl),
      contentType: 'image/png',
      originalName: `${field}.png`,
    });
    return this.setSigningImage(tenantId, field, key);
  }

  /**
   * Store a custom company-stamp image, for lenders whose (undated) stamp
   * should replace the drawn default. PNG/JPG only — pdfkit can embed nothing else.
   */
  async uploadStamp(tenantId: string, file: Express.Multer.File): Promise<LenderIdentity> {
    if (!EMBEDDABLE_IMAGE_TYPES.has(file.mimetype)) {
      throw new BadRequestException('The stamp must be a PNG or JPG image');
    }
    const { key } = await this.storage.save({
      buffer: file.buffer,
      contentType: file.mimetype,
      originalName: file.originalname,
    });
    return this.setSigningImage(tenantId, 'companyStamp', key);
  }

  /** Remove a lender signing image; documents fall back to a blank line / the drawn stamp. */
  clearSigningImage(tenantId: string, field: SigningImageField): Promise<LenderIdentity> {
    return this.setSigningImage(tenantId, field, null);
  }

  private async setSigningImage(
    tenantId: string,
    field: SigningImageField,
    key: string | null,
  ): Promise<LenderIdentity> {
    await this.prisma.tenantSettings.upsert({
      where: { tenantId },
      update: { [field]: key },
      create: { tenantId, [field]: key },
    });
    return this.getLenderIdentity(tenantId);
  }

  /** Update the business identity. Empty strings clear a settings field; the
   * display name is only overwritten when a non-empty value is given. */
  async updateLenderIdentity(
    tenantId: string,
    input: LenderIdentityInput,
  ): Promise<LenderIdentity> {
    const data = {
      legalName: input.legalName || null,
      namfisaLicenceNo: input.namfisaLicenceNo || null,
      registrationNo: input.registrationNo || null,
      physicalAddress: input.physicalAddress || null,
      postalAddress: input.postalAddress || null,
      contactPhone: input.contactPhone || null,
      contactEmail: input.contactEmail || null,
      website: input.website || null,
      principalOfficerName: input.principalOfficerName || null,
    };
    await this.prisma.tenantSettings.upsert({
      where: { tenantId },
      update: data,
      create: { tenantId, ...data },
    });
    // Update the tenant's display name (only when provided) and town.
    const tenantData: { name?: string; town?: string | null } = {};
    if (input.name) tenantData.name = input.name;
    if (input.town !== undefined) tenantData.town = input.town || null;
    if (Object.keys(tenantData).length > 0) {
      await this.prisma.tenant.update({ where: { id: tenantId }, data: tenantData });
    }
    return this.getLenderIdentity(tenantId);
  }

  /** Store an uploaded logo and point the tenant at it. Returns the openable URL. */
  async uploadLogo(
    tenantId: string,
    file: Express.Multer.File,
  ): Promise<{ logoUrl: string | null }> {
    const { key } = await this.storage.save({
      buffer: file.buffer,
      contentType: file.mimetype,
      originalName: file.originalname,
    });
    await this.prisma.tenant.update({ where: { id: tenantId }, data: { logoUrl: key } });
    return { logoUrl: await this.resolveImage(key) };
  }

  /** Resolve a stored image key to an openable URL; pass through external URLs. */
  private async resolveImage(value: string | null): Promise<string | null> {
    if (!value) return null;
    if (/^https?:\/\//i.test(value)) return value;
    return this.storage.safeAccessUrl(value);
  }

  /** Set the lender's opening/bank balance. `openingBalance` arrives in major N$. */
  updateOpeningBalance(tenantId: string, openingBalance: number): Promise<TenantSettings> {
    const data = { openingBalance: toCents(openingBalance) };
    return this.prisma.tenantSettings.upsert({
      where: { tenantId },
      update: data,
      create: { tenantId, ...data },
    });
  }

  listProducts(tenantId: string): Promise<LoanProduct[]> {
    return this.prisma.loanProduct.findMany({
      where: { tenantId },
      orderBy: [{ active: 'desc' }, { isDefault: 'desc' }, { createdAt: 'asc' }],
    });
  }

  async createProduct(tenantId: string, input: LoanProductInput): Promise<LoanProduct> {
    return this.prisma.$transaction(async (tx) => {
      if (input.isDefault) {
        await tx.loanProduct.updateMany({
          where: { tenantId, isDefault: true },
          data: { isDefault: false },
        });
      }
      return tx.loanProduct.create({
        data: {
          tenantId,
          name: input.name,
          loanType: input.loanType ?? null,
          interestRate: input.interestRate,
          active: input.active ?? true,
          isDefault: input.isDefault ?? false,
        },
      });
    });
  }

  async updateProduct(
    tenantId: string,
    id: string,
    input: UpdateLoanProductInput,
  ): Promise<LoanProduct> {
    return this.prisma.$transaction(async (tx) => {
      const product = await tx.loanProduct.findFirst({ where: { id, tenantId } });
      if (!product) {
        throw new NotFoundException('Product not found');
      }
      if (input.isDefault) {
        await tx.loanProduct.updateMany({
          where: { tenantId, isDefault: true, id: { not: id } },
          data: { isDefault: false },
        });
      }
      const data: Prisma.LoanProductUpdateInput = {};
      if (input.name !== undefined) data.name = input.name;
      if (input.loanType !== undefined) data.loanType = input.loanType ?? null;
      if (input.interestRate !== undefined) data.interestRate = input.interestRate;
      if (input.active !== undefined) data.active = input.active;
      if (input.isDefault !== undefined) data.isDefault = input.isDefault;
      return tx.loanProduct.update({ where: { id }, data });
    });
  }

  async deleteProduct(tenantId: string, id: string): Promise<{ ok: true }> {
    const product = await this.prisma.loanProduct.findFirst({
      where: { id, tenantId },
      include: { _count: { select: { loans: true } } },
    });
    if (!product) {
      throw new NotFoundException('Product not found');
    }
    if (product._count.loans > 0) {
      throw new BadRequestException(
        'This product has loans priced from it — deactivate it instead of deleting',
      );
    }
    await this.prisma.loanProduct.delete({ where: { id } });
    return { ok: true };
  }

  /**
   * Resolve the rate plan for a new loan: the explicitly chosen product (must be
   * active), otherwise the tenant's default active product, otherwise null (the
   * caller falls back to the loan type's standard rate).
   */
  async resolveProduct(
    tenantId: string,
    productId?: string,
    loanType?: LoanType,
  ): Promise<LoanProduct | null> {
    if (productId) {
      const product = await this.prisma.loanProduct.findFirst({ where: { id: productId, tenantId } });
      if (!product) {
        throw new NotFoundException('Selected product not found');
      }
      if (!product.active) {
        throw new BadRequestException('Selected product is inactive');
      }
      return product;
    }
    return this.prisma.loanProduct.findFirst({
      where: {
        tenantId,
        active: true,
        isDefault: true,
        ...(loanType ? { OR: [{ loanType }, { loanType: null }] } : {}),
      },
      // Prefer a type-specific default over an "any-type" one.
      orderBy: { loanType: { sort: 'desc', nulls: 'last' } },
    });
  }

  /**
   * NAMFISA levies (and stamp duty) collected per calendar year, for the annual
   * remittance. Cancelled loans never advanced funds, so they are excluded.
   */
  async leviesReport(tenantId: string): Promise<LevyReport> {
    const loans = await this.prisma.loan.findMany({
      where: { tenantId, status: { not: 'cancelled' }, namfisaLevy: { gt: 0 } },
      select: { namfisaLevy: true, stampDuty: true, disbursedAt: true, createdAt: true },
    });

    const byYear = new Map<number, LevyYear>();
    for (const loan of loans) {
      const year = (loan.disbursedAt ?? loan.createdAt).getFullYear();
      const bucket = byYear.get(year) ?? { year, loanCount: 0, levyCents: 0, stampDutyCents: 0 };
      bucket.loanCount += 1;
      bucket.levyCents += loan.namfisaLevy;
      bucket.stampDutyCents += loan.stampDuty;
      byYear.set(year, bucket);
    }

    const years = [...byYear.values()].sort((a, b) => b.year - a.year);
    return {
      years,
      totalLevyCents: years.reduce((sum, y) => sum + y.levyCents, 0),
      totalStampDutyCents: years.reduce((sum, y) => sum + y.stampDutyCents, 0),
    };
  }
}
