import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { SettingsModule } from '../settings/settings.module';
import { LoansService } from './loans.service';
import { LoansController } from './loans.controller';

@Module({
  imports: [AuditModule, SettingsModule],
  providers: [LoansService],
  controllers: [LoansController],
  exports: [LoansService],
})
export class LoansModule {}
