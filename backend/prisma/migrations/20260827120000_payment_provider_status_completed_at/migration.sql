-- CreateIndex
CREATE INDEX "Payment_provider_status_completedAt_idx" ON "Payment"("provider", "status", "completedAt");
