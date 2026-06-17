import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module';
import { HealthModule } from './health/health.module';
import { ApplicationsModule } from './applications/applications.module';
import { TenantsModule } from './tenants/tenants.module';
import { AuthModule } from './auth/auth.module';
import { BorrowersModule } from './borrowers/borrowers.module';
import { LoansModule } from './loans/loans.module';
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
    StatsModule,
  ],
})
export class AppModule {}
