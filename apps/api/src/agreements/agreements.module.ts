import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { DocumentsModule } from '../documents/documents.module';
import { SettingsModule } from '../settings/settings.module';
import { MailModule } from '../mail/mail.module';
import { AgreementsService } from './agreements.service';
import { AgreementsController } from './agreements.controller';

@Module({
  imports: [PrismaModule, DocumentsModule, SettingsModule, MailModule],
  providers: [AgreementsService],
  controllers: [AgreementsController],
  exports: [AgreementsService],
})
export class AgreementsModule {}
