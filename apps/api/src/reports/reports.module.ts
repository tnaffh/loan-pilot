import { Module } from '@nestjs/common';
import { SettingsModule } from '../settings/settings.module';
import { DocumentsModule } from '../documents/documents.module';
import { ReportsService } from './reports.service';
import { ReportsController } from './reports.controller';

@Module({
  imports: [SettingsModule, DocumentsModule],
  providers: [ReportsService],
  controllers: [ReportsController],
})
export class ReportsModule {}
