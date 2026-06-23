import { Test } from '@nestjs/testing';
import { IncomeService } from './income.service';
import { PrismaService } from '../prisma/prisma.service';

describe('IncomeService', () => {
  const create = jest.fn();
  const aggregate = jest.fn();
  const prismaMock = { income: { create, aggregate, findMany: jest.fn() } };
  let service: IncomeService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [IncomeService, { provide: PrismaService, useValue: prismaMock }],
    }).compile();
    service = moduleRef.get(IncomeService);
  });

  it('converts the amount to cents on create', async () => {
    create.mockImplementation((args: { data: Record<string, unknown> }) =>
      Promise.resolve({ id: 'inc_1', ...args.data }),
    );
    await service.create('tenant_1', { category: 'Recovery', amount: 250 });
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ amount: 25000 }) }),
    );
  });

  it('totals income (cents) and counts entries', async () => {
    aggregate.mockResolvedValue({ _sum: { amount: 75000 }, _count: 3 });
    expect(await service.totals('tenant_1')).toEqual({ total: 75000, count: 3 });
  });
});
