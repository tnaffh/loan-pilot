-- CreateEnum
CREATE TYPE "PlanId" AS ENUM ('starter', 'growth', 'pro');

-- CreateEnum
CREATE TYPE "TenantStatus" AS ENUM ('active', 'trial', 'suspended');

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('platform', 'lender_admin', 'lender_staff', 'borrower');

-- CreateEnum
CREATE TYPE "LoanType" AS ENUM ('payday', 'business', 'collateral');

-- CreateEnum
CREATE TYPE "LoanStatus" AS ENUM ('active', 'arrears', 'settled', 'closed');

-- CreateEnum
CREATE TYPE "ApplicationStatus" AS ENUM ('pending', 'review', 'approved', 'declined');

-- CreateEnum
CREATE TYPE "AffordabilityResult" AS ENUM ('pass', 'review', 'fail');

-- CreateEnum
CREATE TYPE "RepaymentStatus" AS ENUM ('paid', 'due', 'overdue');

-- CreateEnum
CREATE TYPE "InvoiceStatus" AS ENUM ('paid', 'overdue', 'pending');

-- CreateEnum
CREATE TYPE "EmploymentType" AS ENUM ('permanently_employed', 'civil_servant', 'self_employed', 'contract', 'pensioner');

-- CreateTable
CREATE TABLE "Tenant" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "short" TEXT NOT NULL,
    "accent" TEXT NOT NULL DEFAULT '#25397a',
    "plan" "PlanId" NOT NULL DEFAULT 'starter',
    "status" "TenantStatus" NOT NULL DEFAULT 'trial',
    "town" TEXT,
    "logoUrl" TEXT,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Tenant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'lender_staff',
    "tenantId" TEXT,
    "borrowerId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Borrower" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "idNumber" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "employer" TEXT NOT NULL,
    "occupation" TEXT NOT NULL,
    "monthlyIncome" INTEGER NOT NULL,
    "employmentType" "EmploymentType" NOT NULL,
    "bank" TEXT NOT NULL,
    "accountType" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "since" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Borrower_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Loan" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "borrowerId" TEXT NOT NULL,
    "type" "LoanType" NOT NULL,
    "principal" INTEGER NOT NULL,
    "financeCharge" INTEGER NOT NULL,
    "total" INTEGER NOT NULL,
    "termMonths" INTEGER NOT NULL,
    "instalment" INTEGER NOT NULL,
    "instalmentsPaid" INTEGER NOT NULL DEFAULT 0,
    "instalmentsTotal" INTEGER NOT NULL,
    "balance" INTEGER NOT NULL,
    "status" "LoanStatus" NOT NULL DEFAULT 'active',
    "collateral" TEXT,
    "daysLate" INTEGER NOT NULL DEFAULT 0,
    "disbursedAt" TIMESTAMP(3),
    "nextDueAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Loan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RepaymentScheduleItem" (
    "id" TEXT NOT NULL,
    "loanId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "dueAt" TIMESTAMP(3) NOT NULL,
    "amount" INTEGER NOT NULL,
    "status" "RepaymentStatus" NOT NULL DEFAULT 'due',
    "paidAt" TIMESTAMP(3),

    CONSTRAINT "RepaymentScheduleItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LoanApplication" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "idNumber" TEXT NOT NULL,
    "dateOfBirth" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "maritalStatus" TEXT,
    "type" "LoanType" NOT NULL,
    "amount" INTEGER NOT NULL,
    "termMonths" INTEGER NOT NULL,
    "purpose" TEXT,
    "declaredIncome" INTEGER NOT NULL,
    "employmentType" "EmploymentType" NOT NULL,
    "employer" TEXT NOT NULL,
    "occupation" TEXT NOT NULL,
    "bank" TEXT NOT NULL,
    "accountType" TEXT NOT NULL,
    "quotedTotal" INTEGER NOT NULL,
    "quotedInstalment" INTEGER NOT NULL,
    "affordabilityRatio" DOUBLE PRECISION NOT NULL,
    "status" "ApplicationStatus" NOT NULL DEFAULT 'pending',
    "affordability" "AffordabilityResult" NOT NULL DEFAULT 'review',
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LoanApplication_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApplicationReference" (
    "id" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,

    CONSTRAINT "ApplicationReference_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Document" (
    "id" TEXT NOT NULL,
    "applicationId" TEXT,
    "kind" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Document_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Invoice" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "plan" "PlanId",
    "amount" INTEGER NOT NULL,
    "status" "InvoiceStatus" NOT NULL DEFAULT 'pending',
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Invoice_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Tenant_slug_key" ON "Tenant"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_borrowerId_key" ON "User"("borrowerId");

-- CreateIndex
CREATE INDEX "User_tenantId_idx" ON "User"("tenantId");

-- CreateIndex
CREATE INDEX "Borrower_tenantId_idx" ON "Borrower"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "Borrower_tenantId_idNumber_key" ON "Borrower"("tenantId", "idNumber");

-- CreateIndex
CREATE INDEX "Loan_tenantId_idx" ON "Loan"("tenantId");

-- CreateIndex
CREATE INDEX "Loan_borrowerId_idx" ON "Loan"("borrowerId");

-- CreateIndex
CREATE INDEX "RepaymentScheduleItem_loanId_idx" ON "RepaymentScheduleItem"("loanId");

-- CreateIndex
CREATE UNIQUE INDEX "RepaymentScheduleItem_loanId_number_key" ON "RepaymentScheduleItem"("loanId", "number");

-- CreateIndex
CREATE INDEX "LoanApplication_tenantId_idx" ON "LoanApplication"("tenantId");

-- CreateIndex
CREATE INDEX "LoanApplication_status_idx" ON "LoanApplication"("status");

-- CreateIndex
CREATE INDEX "ApplicationReference_applicationId_idx" ON "ApplicationReference"("applicationId");

-- CreateIndex
CREATE INDEX "Document_applicationId_idx" ON "Document"("applicationId");

-- CreateIndex
CREATE INDEX "Invoice_tenantId_idx" ON "Invoice"("tenantId");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_borrowerId_fkey" FOREIGN KEY ("borrowerId") REFERENCES "Borrower"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Borrower" ADD CONSTRAINT "Borrower_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Loan" ADD CONSTRAINT "Loan_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Loan" ADD CONSTRAINT "Loan_borrowerId_fkey" FOREIGN KEY ("borrowerId") REFERENCES "Borrower"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RepaymentScheduleItem" ADD CONSTRAINT "RepaymentScheduleItem_loanId_fkey" FOREIGN KEY ("loanId") REFERENCES "Loan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoanApplication" ADD CONSTRAINT "LoanApplication_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApplicationReference" ADD CONSTRAINT "ApplicationReference_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "LoanApplication"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "LoanApplication"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
