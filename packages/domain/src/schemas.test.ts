import { createBorrowerSchema, updateBorrowerSchema } from './schemas';

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
