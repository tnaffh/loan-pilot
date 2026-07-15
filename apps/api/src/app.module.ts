import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module';
import { HealthModule } from './health/health.module';
import { ApplicationsModule } from './applications/applications.module';
import { TenantsModule } from './tenants/tenants.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { RolesModule } from './roles/roles.module';
import { BorrowersModule } from './borrowers/borrowers.module';
import { LoansModule } from './loans/loans.module';
import { PaymentsModule } from './payments/payments.module';
import { ExpensesModule } from './expenses/expenses.module';
import { InvestmentsModule } from './investments/investments.module';
import { IncomeModule } from './income/income.module';
import { StatsModule } from './stats/stats.module';
import { DocumentsModule } from './documents/documents.module';
import { SettingsModule } from './settings/settings.module';
import { AgreementsModule } from './agreements/agreements.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    HealthModule,
    ApplicationsModule,
    TenantsModule,
    AuthModule,
    UsersModule,
    RolesModule,
    BorrowersModule,
    LoansModule,
    PaymentsModule,
    ExpensesModule,
    InvestmentsModule,
    IncomeModule,
    StatsModule,
    DocumentsModule,
    SettingsModule,
    AgreementsModule,
  ],
})
export class AppModule {}
