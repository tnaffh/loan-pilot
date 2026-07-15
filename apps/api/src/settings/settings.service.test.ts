import { Test } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { LoanType } from '@loan-pilot/domain';
import { SettingsService } from './settings.service';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../documents/storage.service';

describe('SettingsService', () => {
  const productFindFirst = jest.fn();
  const loanFindMany = jest.fn();
  const settingsUpsert = jest.fn();

  const prismaMock = {
    tenantSettings: {
      findUnique: jest.fn(),
      create: jest.fn(),
      upsert: settingsUpsert,
    },
    loanProduct: {
      findFirst: productFindFirst,
      findMany: jest.fn(),
    },
    loan: { findMany: loanFindMany },
    $transaction: jest.fn(),
  };

  let service: SettingsService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [
        SettingsService,
        { provide: PrismaService, useValue: prismaMock },
        {
          provide: StorageService,
          useValue: { save: jest.fn(), safeAccessUrl: jest.fn().mockResolvedValue(null) },
        },
      ],
    }).compile();
    service = moduleRef.get(SettingsService);
  });

  describe('resolveProduct', () => {
    it('returns the chosen active product', async () => {
      productFindFirst.mockResolvedValue({ id: 'p1', active: true, interestRate: 0.25 });
      const product = await service.resolveProduct('t1', 'p1', LoanType.Payday);
      expect(product?.id).toBe('p1');
    });

    it('rejects an inactive product', async () => {
      productFindFirst.mockResolvedValue({ id: 'p1', active: false });
      await expect(service.resolveProduct('t1', 'p1')).rejects.toThrow(BadRequestException);
    });

    it('falls back to the default product when none is chosen', async () => {
      productFindFirst.mockResolvedValue({ id: 'default', active: true, isDefault: true });
      const product = await service.resolveProduct('t1');
      expect(product?.id).toBe('default');
      expect(productFindFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ isDefault: true }) }),
      );
    });
  });

  describe('updateFeeSettings', () => {
    it('converts major-N$ fees to cents', async () => {
      settingsUpsert.mockResolvedValue({});
      await service.updateFeeSettings('t1', {
        namfisaLevyRate: 0.0103,
        stampDuty: 5,
        insuranceRate: 0,
        insuranceFlat: 0,
      });
      expect(settingsUpsert).toHaveBeenCalledWith(
        expect.objectContaining({
          update: expect.objectContaining({ stampDuty: 500, namfisaLevyRate: 0.0103 }),
        }),
      );
    });

    it('clamps the monthly rate to the 5% NAMFISA ceiling', async () => {
      settingsUpsert.mockResolvedValue({});
      await service.updateFeeSettings('t1', {
        namfisaLevyRate: 0,
        stampDuty: 0,
        insuranceRate: 0,
        insuranceFlat: 0,
        monthlyRate: 0.2,
      });
      expect(settingsUpsert).toHaveBeenCalledWith(
        expect.objectContaining({ update: expect.objectContaining({ monthlyRate: 0.05 }) }),
      );
    });
  });

  describe('resolveFeeSettings', () => {
    it('surfaces the stored monthly rate in the domain shape', async () => {
      prismaMock.tenantSettings.findUnique.mockResolvedValue({
        namfisaLevyRate: 0.0103,
        stampDuty: 500,
        insuranceRate: 0,
        insuranceFlat: 0,
        monthlyRate: 0.05,
      });
      const settings = await service.resolveFeeSettings('t1');
      expect(settings.monthlyRate).toBe(0.05);
      expect(settings.stampDutyCents).toBe(500);
    });
  });

  describe('leviesReport', () => {
    it('groups levies and stamp duty by the year a loan was advanced', async () => {
      loanFindMany.mockResolvedValue([
        { namfisaLevy: 1030, stampDuty: 500, disbursedAt: new Date('2024-03-01'), createdAt: new Date() },
        { namfisaLevy: 2060, stampDuty: 500, disbursedAt: new Date('2024-09-01'), createdAt: new Date() },
        { namfisaLevy: 5000, stampDuty: 500, disbursedAt: new Date('2025-01-01'), createdAt: new Date() },
      ]);
      const report = await service.leviesReport('t1');
      expect(report.totalLevyCents).toBe(8090);
      expect(report.totalStampDutyCents).toBe(1500);
      // Most recent year first.
      expect(report.years[0]).toMatchObject({ year: 2025, loanCount: 1, levyCents: 5000 });
      expect(report.years[1]).toMatchObject({ year: 2024, loanCount: 2, levyCents: 3090 });
    });
  });
});
