-- CreateTable
CREATE TABLE "ImmediateInvoice" (
    "id" TEXT NOT NULL,
    "familyId" TEXT NOT NULL,
    "stripeInvoiceId" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ImmediateInvoice_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ImmediateInvoice_stripeInvoiceId_key" ON "ImmediateInvoice"("stripeInvoiceId");

-- CreateIndex
CREATE INDEX "ImmediateInvoice_familyId_periodStart_periodEnd_idx" ON "ImmediateInvoice"("familyId", "periodStart", "periodEnd");

-- AddForeignKey
ALTER TABLE "ImmediateInvoice" ADD CONSTRAINT "ImmediateInvoice_familyId_fkey" FOREIGN KEY ("familyId") REFERENCES "Family"("id") ON DELETE CASCADE ON UPDATE CASCADE;
