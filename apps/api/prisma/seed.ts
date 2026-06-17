import { PrismaClient } from '@prisma/client';
import { hashSync } from 'bcryptjs';
import {
  ApplicationStatus,
  EmploymentType,
  LoanStatus,
  LoanType,
  PlanId,
  RepaymentStatus,
  TenantStatus,
  UserRole,
  addMonths,
  assessAffordability,
  quote,
  toCents,
} from '@loan-pilot/domain';

const prisma = new PrismaClient();

// Dev seed login password for every seeded user: "password123".
const DEV_PASSWORD_HASH = hashSync('password123', 10);

interface LoanSeed {
  type: LoanType;
  principal: number;
  termMonths: number;
  instalmentsPaid: number;
  status: LoanStatus;
  collateral?: string;
  daysLate?: number;
  disbursedAt: string;
}

const seedLoanForBorrower = async (
  tenantId: string,
  borrowerId: string,
  loan: LoanSeed,
): Promise<void> => {
  const loanQuote = quote({
    principalCents: toCents(loan.principal),
    termMonths: loan.termMonths,
    type: loan.type,
  });
  const disbursedAt = new Date(loan.disbursedAt);
  const paidCents = loanQuote.schedule
    .slice(0, loan.instalmentsPaid)
    .reduce((sum, item) => sum + item.amountCents, 0);

  await prisma.loan.create({
    data: {
      tenant: { connect: { id: tenantId } },
      borrower: { connect: { id: borrowerId } },
      type: loan.type,
      principal: loanQuote.principalCents,
      financeCharge: loanQuote.financeChargeCents,
      total: loanQuote.totalCents,
      termMonths: loan.termMonths,
      instalment: loanQuote.instalmentCents,
      instalmentsPaid: loan.instalmentsPaid,
      instalmentsTotal: loan.termMonths,
      balance: loanQuote.totalCents - paidCents,
      status: loan.status,
      collateral: loan.collateral ?? null,
      daysLate: loan.daysLate ?? 0,
      disbursedAt,
      nextDueAt: loan.status === LoanStatus.Settled ? null : addMonths(disbursedAt, loan.instalmentsPaid + 1),
      schedule: {
        create: loanQuote.schedule.map((item) => ({
          number: item.number,
          amount: item.amountCents,
          dueAt: addMonths(disbursedAt, item.number),
          status: item.number <= loan.instalmentsPaid ? RepaymentStatus.Paid : RepaymentStatus.Due,
          paidAt: item.number <= loan.instalmentsPaid ? addMonths(disbursedAt, item.number) : null,
        })),
      },
    },
  });
};

const main = async (): Promise<void> => {
  // Clean slate for a deterministic dev seed.
  await prisma.repaymentScheduleItem.deleteMany();
  await prisma.applicationReference.deleteMany();
  await prisma.document.deleteMany();
  await prisma.loanApplication.deleteMany();
  await prisma.loan.deleteMany();
  await prisma.invoice.deleteMany();
  await prisma.user.deleteMany();
  await prisma.borrower.deleteMany();
  await prisma.tenant.deleteMany();

  const rfs = await prisma.tenant.create({
    data: {
      slug: 'rfs',
      name: 'Raccoons Financial Services',
      short: 'RFS',
      accent: '#25397a',
      plan: PlanId.Growth,
      status: TenantStatus.Active,
      town: 'Windhoek',
      joinedAt: new Date('2023-11-02'),
    },
  });

  await prisma.tenant.createMany({
    data: [
      {
        slug: 'kala',
        name: 'Kalahari Cash',
        short: 'KC',
        accent: '#b4441f',
        plan: PlanId.Pro,
        status: TenantStatus.Active,
        town: 'Rundu',
        joinedAt: new Date('2024-02-18'),
      },
      {
        slug: 'namib',
        name: 'Namib Microloans',
        short: 'NM',
        accent: '#a16207',
        plan: PlanId.Starter,
        status: TenantStatus.Trial,
        town: 'Swakopmund',
        joinedAt: new Date('2026-05-28'),
      },
    ],
  });

  await prisma.user.createMany({
    data: [
      {
        email: 'ops@loanpilot.na',
        name: 'Platform Operator',
        role: UserRole.Platform,
        passwordHash: DEV_PASSWORD_HASH,
      },
      {
        email: 'admin@raccoons.na',
        name: 'Eufemia Nghifenwa',
        role: UserRole.LenderAdmin,
        passwordHash: DEV_PASSWORD_HASH,
        tenantId: rfs.id,
      },
    ],
  });

  const borrowerSeeds = [
    {
      firstName: 'Helena',
      lastName: 'Kapenda',
      idNumber: '98031500412',
      phone: '+264 81 234 5567',
      email: 'helena.k@email.na',
      address: '12 Acacia St, Khomasdal, Windhoek',
      employer: 'Ministry of Health',
      occupation: 'Registered Nurse',
      monthlyIncome: 18500,
      employmentType: EmploymentType.CivilServant,
      bank: 'Bank Windhoek',
      accountType: 'Savings',
    },
    {
      firstName: 'Trofimus',
      lastName: 'Nangolo',
      idNumber: '90061100231',
      phone: '+264 81 552 1180',
      email: 't.nangolo@email.na',
      address: '5 Omuramba Rd, Katutura, Windhoek',
      employer: 'Windhoek High School',
      occupation: 'Teacher',
      monthlyIncome: 22000,
      employmentType: EmploymentType.PermanentlyEmployed,
      bank: 'FNB',
      accountType: 'Cheque',
    },
    {
      firstName: 'Shateni',
      lastName: 'Amukwa',
      idNumber: '85100400785',
      phone: '+264 81 778 9921',
      email: 's.amukwa@shop.na',
      address: '88 Independence Ave, Windhoek CBD',
      employer: 'Amukwa Trading CC',
      occupation: 'Shop owner',
      monthlyIncome: 31000,
      employmentType: EmploymentType.SelfEmployed,
      bank: 'Standard Bank',
      accountType: 'Cheque',
    },
    {
      firstName: 'Petrus',
      lastName: 'Haufiku',
      idNumber: '88021900456',
      phone: '+264 81 445 6610',
      email: 'p.haufiku@email.na',
      address: '4 Eros St, Klein Windhoek',
      employer: 'Pupkewitz Motors',
      occupation: 'Sales executive',
      monthlyIncome: 26500,
      employmentType: EmploymentType.PermanentlyEmployed,
      bank: 'FNB',
      accountType: 'Cheque',
    },
  ];

  const borrowers = await Promise.all(
    borrowerSeeds.map((data) =>
      prisma.borrower.create({
        data: {
          ...data,
          // Seed incomes above are in major N$; the column stores cents.
          monthlyIncome: toCents(data.monthlyIncome),
          tenant: { connect: { id: rfs.id } },
        },
      }),
    ),
  );

  // Borrower portal login, linked to the first seeded borrower.
  const firstBorrower = borrowers[0];
  if (firstBorrower) {
    await prisma.user.create({
      data: {
        email: 'helena@email.na',
        name: `${firstBorrower.firstName} ${firstBorrower.lastName}`,
        role: UserRole.Borrower,
        passwordHash: DEV_PASSWORD_HASH,
        tenantId: rfs.id,
        borrowerId: firstBorrower.id,
      },
    });
  }

  const loanPlan: LoanSeed[] = [
    {
      type: LoanType.Payday,
      principal: 8000,
      termMonths: 2,
      instalmentsPaid: 1,
      status: LoanStatus.Active,
      disbursedAt: '2026-05-25',
    },
    {
      type: LoanType.Payday,
      principal: 5000,
      termMonths: 1,
      instalmentsPaid: 0,
      status: LoanStatus.Active,
      disbursedAt: '2026-06-02',
    },
    {
      type: LoanType.Business,
      principal: 60000,
      termMonths: 5,
      instalmentsPaid: 2,
      status: LoanStatus.Arrears,
      daysLate: 12,
      disbursedAt: '2026-03-15',
    },
    {
      type: LoanType.Collateral,
      principal: 120000,
      termMonths: 5,
      instalmentsPaid: 1,
      status: LoanStatus.Active,
      collateral: 'Toyota Hilux 2021 (N99-123W)',
      disbursedAt: '2026-05-10',
    },
  ];

  await Promise.all(
    borrowers.map((borrower, index) => {
      const plan = loanPlan[index];
      return plan ? seedLoanForBorrower(rfs.id, borrower.id, plan) : Promise.resolve();
    }),
  );

  const applicationSeeds = [
    {
      firstName: 'Selma',
      lastName: 'Nghidinwa',
      idNumber: '99052100654',
      type: LoanType.Payday,
      amount: 6000,
      termMonths: 2,
      income: 14000,
      employmentType: EmploymentType.PermanentlyEmployed,
      status: ApplicationStatus.Pending,
    },
    {
      firstName: 'David',
      lastName: 'Garoeb',
      idNumber: '87031200998',
      type: LoanType.Business,
      amount: 75000,
      termMonths: 5,
      income: 52000,
      employmentType: EmploymentType.SelfEmployed,
      status: ApplicationStatus.Review,
    },
    {
      firstName: 'Aina',
      lastName: 'Hamutenya',
      idNumber: '95080300221',
      type: LoanType.Payday,
      amount: 9500,
      termMonths: 1,
      income: 12000,
      employmentType: EmploymentType.Contract,
      status: ApplicationStatus.Pending,
    },
  ];

  await Promise.all(
    applicationSeeds.map((seed) => {
      const loanQuote = quote({
        principalCents: toCents(seed.amount),
        termMonths: seed.termMonths,
        type: seed.type,
      });
      const assessment = assessAffordability({
        monthlyIncomeCents: toCents(seed.income),
        instalmentCents: loanQuote.instalmentCents,
      });
      return prisma.loanApplication.create({
        data: {
          tenant: { connect: { id: rfs.id } },
          firstName: seed.firstName,
          lastName: seed.lastName,
          idNumber: seed.idNumber,
          dateOfBirth: '1990-01-01',
          phone: '+264 81 000 0000',
          email: `${seed.firstName.toLowerCase()}@email.na`,
          address: 'Windhoek, Namibia',
          type: seed.type,
          amount: toCents(seed.amount),
          termMonths: seed.termMonths,
          declaredIncome: toCents(seed.income),
          employmentType: seed.employmentType,
          employer: 'Various',
          occupation: 'Applicant',
          bank: 'Bank Windhoek',
          accountType: 'Savings',
          quotedTotal: loanQuote.totalCents,
          quotedInstalment: loanQuote.instalmentCents,
          affordabilityRatio: assessment.ratio,
          affordability: assessment.result,
          status: seed.status,
          references: {
            create: [
              { name: 'Reference One', phone: '+264 81 111 1111' },
              { name: 'Reference Two', phone: '+264 81 222 2222' },
            ],
          },
        },
      });
    }),
  );

  await prisma.invoice.createMany({
    data: [
      {
        tenantId: rfs.id,
        description: 'Growth plan — June 2026',
        plan: PlanId.Growth,
        amount: toCents(1499),
        status: 'paid',
        issuedAt: new Date('2026-06-01'),
      },
    ],
  });

  const counts = {
    tenants: await prisma.tenant.count(),
    borrowers: await prisma.borrower.count(),
    loans: await prisma.loan.count(),
    applications: await prisma.loanApplication.count(),
  };
  // eslint-disable-next-line no-console
  console.log('Seed complete:', counts);
};

main()
  .catch((error) => {
    // eslint-disable-next-line no-console
    console.error(error);
    process.exit(1);
  })
  .finally(() => {
    void prisma.$disconnect();
  });
