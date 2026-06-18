import { Module } from '@nestjs/common';
import { TenantsModule } from '../tenants/tenants.module';
import { DocumentsService } from './documents.service';
import { DocumentsController } from './documents.controller';
import { StorageService } from './storage.service';

@Module({
  imports: [TenantsModule],
  providers: [DocumentsService, StorageService],
  controllers: [DocumentsController],
  exports: [StorageService],
})
export class DocumentsModule {}
