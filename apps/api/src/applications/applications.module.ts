import { Module } from '@nestjs/common';
import { TenantsModule } from '../tenants/tenants.module';
import { LoansModule } from '../loans/loans.module';
import { SettingsModule } from '../settings/settings.module';
import { DocumentsModule } from '../documents/documents.module';
import { AgreementsModule } from '../agreements/agreements.module';
import { ApplicationsService } from './applications.service';
import { ApplicationsController } from './applications.controller';

@Module({
  imports: [TenantsModule, LoansModule, SettingsModule, DocumentsModule, AgreementsModule],
  providers: [ApplicationsService],
  controllers: [ApplicationsController],
})
export class ApplicationsModule {}
