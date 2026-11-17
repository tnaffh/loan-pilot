import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { LoanCalculationService } from './loan-calculation.service';

/**
 * Renews unpaid monthly-renewal loans on time. Loans are also recalculated when
 * opened or paid, so this only keeps lists, totals and reports current for loans
 * nobody has touched. Safe to run more than once: the calculation is idempotent.
 */
@Injectable()
export class RenewalsCron {
  private readonly logger = new Logger(RenewalsCron.name);

  constructor(private readonly calculation: LoanCalculationService) {}

  @Cron(CronExpression.EVERY_DAY_AT_1AM, { timeZone: 'Africa/Windhoek' })
  async renewDueLoans(): Promise<void> {
    const count = await this.calculation.refreshRenewingLoans();

    this.logger.log(`Recalculated ${count} monthly-renewal loan(s)`);
  }
}
