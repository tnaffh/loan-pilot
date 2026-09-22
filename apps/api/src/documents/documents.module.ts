import { Module } from '@nestjs/common';
import { TenantsModule } from '../tenants/tenants.module';
import { DocumentsService } from './documents.service';
import { DocumentsController } from './documents.controller';
import { DocumentDownloadController } from './document-download.controller';
import { StorageService } from './storage.service';

@Module({
  imports: [TenantsModule],
  providers: [DocumentsService, StorageService],
  controllers: [DocumentsController, DocumentDownloadController],
  exports: [StorageService, DocumentsService],
})
export class DocumentsModule {}
