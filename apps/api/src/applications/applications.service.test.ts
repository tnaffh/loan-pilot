import { Test } from '@nestjs/testing';
import { EmploymentType, LoanType, type CreateApplicationInput } from '@loan-pilot/domain';
import { ApplicationsService } from './applications.service';
import { PrismaService } from '../prisma/prisma.service';

describe('ApplicationsService', () => {
  const create = jest.fn();
  const prismaMock = { loanApplication: { create, findMany: jest.fn() } };
  let service: ApplicationsService;

  beforeEach(async () => {
    create.mockReset();
    create.mockImplementation((args: { data: Record<string, unknown> }) =>
      Promise.resolve({ id: 'app_1', ...args.data }),
    );

    const moduleRef = await Test.createTestingModule({
      providers: [ApplicationsService, { provide: PrismaService, useValue: prismaMock }],
    }).compile();

    service = moduleRef.get(ApplicationsService);
  });

  const baseInput: CreateApplicationInput = {
    loanType: LoanType.Payday,
    amount: 5000,
    termMonths: 1,
    firstName: 'Selma',
    lastName: 'Nghidinwa',
    idNumber: '98031500412',
    dateOfBirth: '15/03/1998',
    phone: '+264811112222',
    email: 'selma@example.na',
    address: '12 Acacia St, Windhoek',
    employmentType: EmploymentType.PermanentlyEmployed,
    employer: 'Ministry of Health',
    occupation: 'Nurse',
    monthlyIncome: 18000,
    bank: 'Bank Windhoek',
    accountType: 'Savings',
    references: [
      { name: 'Helena K', phone: '+264811234567' },
      { name: 'Petrus H', phone: '+264814455667' },
    ],
    consent: true,
  };

  it('prices the loan in cents and stores an affordability assessment', async () => {
    await service.create('tenant_1', baseInput);

    expect(create).toHaveBeenCalledTimes(1);
    const data = create.mock.calls[0][0].data;
    expect(data.amount).toBe(500000); // N$ 5,000 in cents
    expect(data.quotedTotal).toBe(650000); // 30% finance charge
    expect(data.quotedInstalment).toBe(650000);
    expect(data.affordability).toBe('pass');
    expect(data.tenant.connect.id).toBe('tenant_1');
    expect(data.references.create).toHaveLength(2);
  });

  it('fails affordability when the instalment is unaffordable', async () => {
    await service.create('tenant_1', { ...baseInput, amount: 15000, monthlyIncome: 9000 });

    const data = create.mock.calls[0][0].data;
    expect(data.affordability).toBe('fail');
  });
});
