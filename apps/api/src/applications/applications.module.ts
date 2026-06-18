import { Module } from '@nestjs/common';
import { TenantsModule } from '../tenants/tenants.module';
import { LoansModule } from '../loans/loans.module';
import { DocumentsModule } from '../documents/documents.module';
import { ApplicationsService } from './applications.service';
import { ApplicationsController } from './applications.controller';

@Module({
  imports: [TenantsModule, LoansModule, DocumentsModule],
  providers: [ApplicationsService],
  controllers: [ApplicationsController],
})
export class ApplicationsModule {}
