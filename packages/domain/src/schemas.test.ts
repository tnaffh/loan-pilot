import { createApplicationSchema, createBorrowerSchema, updateBorrowerSchema } from './schemas';
import { TERMS_VERSION } from './terms';

describe('borrower email validation', () => {
  it('requires a valid email on create', () => {
    const base = {
      firstName: 'Selma',
      lastName: 'N',
      idNumber: '98031500412',
      phone: '+264811112222',
      address: { street: '1 St', city: 'Windhoek', country: 'Namibia' },
      employer: 'MoH',
      occupation: 'Nurse',
      monthlyIncome: 18500,
      employmentType: 'permanently_employed',
      bankAccount: {
        bankName: 'Bank Windhoek',
        accountNumber: '62001234567',
        accountHolderName: 'Selma N',
        accountType: 'Savings',
      },
    };
    expect(createBorrowerSchema.safeParse({ ...base, email: '' }).success).toBe(false);
    expect(createBorrowerSchema.safeParse({ ...base, email: 'selma@example.na' }).success).toBe(true);
  });

  it('allows an empty email on update (correcting imported records)', () => {
    expect(updateBorrowerSchema.safeParse({ email: '' }).success).toBe(true);
    expect(updateBorrowerSchema.safeParse({ email: 'ok@example.na' }).success).toBe(true);
    expect(updateBorrowerSchema.safeParse({ email: 'not-an-email' }).success).toBe(false);
  });
});

describe('createApplicationSchema — collateral', () => {
  const base = {
    amount: 5000,
    termMonths: 3,
    firstName: 'Selma',
    lastName: 'Nghidinwa',
    idNumber: '98031500412',
    dateOfBirth: '1998-03-15',
    phone: '+264811112222',
    email: 'selma@example.na',
    address: { street: '12 Acacia St', city: 'Windhoek', country: 'Namibia' },
    postalSameAsResidential: true,
    employmentType: 'permanently_employed',
    employer: 'MoH',
    occupation: 'Nurse',
    monthlyIncome: 18000,
    bankAccount: {
      bankName: 'Bank Windhoek',
      accountNumber: '62001234567',
      accountHolderName: 'Selma Nghidinwa',
      accountType: 'Savings',
    },
    references: [{ name: 'Helena K', phone: '+264811234567' }],
    consent: true,
    tcAccepted: true,
    tcVersion: TERMS_VERSION,
    signature: { dataUrl: 'data:image/png;base64,iVBORw0KGgo=' },
  } as const;

  it('does not require a collateral object for a payday loan', () => {
    expect(createApplicationSchema.safeParse({ ...base, loanType: 'payday' }).success).toBe(true);
  });

  it('requires the collateral details for a collateral loan', () => {
    expect(createApplicationSchema.safeParse({ ...base, loanType: 'collateral' }).success).toBe(false);
    const result = createApplicationSchema.safeParse({
      ...base,
      loanType: 'collateral',
      collateral: {
        item: 'Toyota Corolla 2015',
        identifier: 'N 12345 W',
        description: 'Silver sedan, 120,000 km',
        condition: 'Good',
        estimatedValue: 85000,
      },
    });
    expect(result.success).toBe(true);
  });

  it('keeps the collateral field reachable via innerType().shape (single superRefine)', () => {
    expect('collateral' in createApplicationSchema.innerType().shape).toBe(true);
  });
});
