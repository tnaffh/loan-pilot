import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { SettingsModule } from '../settings/settings.module';
import { DocumentsModule } from '../documents/documents.module';
import { AgreementsModule } from '../agreements/agreements.module';
import { LoansService } from './loans.service';
import { LoansController } from './loans.controller';

@Module({
  imports: [AuditModule, SettingsModule, DocumentsModule, AgreementsModule],
  providers: [LoansService],
  controllers: [LoansController],
  exports: [LoansService],
})
export class LoansModule {}
