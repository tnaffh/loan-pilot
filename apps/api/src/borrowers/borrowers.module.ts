import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { DocumentsModule } from '../documents/documents.module';
import { SettingsModule } from '../settings/settings.module';
import { BorrowersService } from './borrowers.service';
import { BorrowersController } from './borrowers.controller';

@Module({
  imports: [AuditModule, DocumentsModule, SettingsModule],
  providers: [BorrowersService],
  controllers: [BorrowersController],
})
export class BorrowersModule {}
