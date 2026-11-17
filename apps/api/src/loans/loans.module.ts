import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { SettingsModule } from '../settings/settings.module';
import { DocumentsModule } from '../documents/documents.module';
import { AgreementsModule } from '../agreements/agreements.module';
import { LoansService } from './loans.service';
import { LoanCalculationService } from './loan-calculation.service';
import { RenewalsCron } from './renewals.cron';
import { LoansController } from './loans.controller';

@Module({
  imports: [AuditModule, SettingsModule, DocumentsModule, AgreementsModule],
  providers: [LoansService, LoanCalculationService, RenewalsCron],
  controllers: [LoansController],
  exports: [LoansService, LoanCalculationService],
})
export class LoansModule {}
