import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module';
import { HealthModule } from './health/health.module';
import { ApplicationsModule } from './applications/applications.module';
import { TenantsModule } from './tenants/tenants.module';
import { AuthModule } from './auth/auth.module';
import { BorrowersModule } from './borrowers/borrowers.module';
import { LoansModule } from './loans/loans.module';
import { PaymentsModule } from './payments/payments.module';
import { ExpensesModule } from './expenses/expenses.module';
import { InvestmentsModule } from './investments/investments.module';
import { StatsModule } from './stats/stats.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    HealthModule,
    ApplicationsModule,
    TenantsModule,
    AuthModule,
    BorrowersModule,
    LoansModule,
    PaymentsModule,
    ExpensesModule,
    InvestmentsModule,
    StatsModule,
  ],
})
export class AppModule {}
