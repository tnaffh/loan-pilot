import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { BorrowersService } from './borrowers.service';
import { BorrowersController } from './borrowers.controller';

@Module({
  imports: [AuditModule],
  providers: [BorrowersService],
  controllers: [BorrowersController],
})
export class BorrowersModule {}
