-- Internal partner: optional order category at checkout creation
ALTER TABLE "Order" ADD COLUMN "partnerOrderCategory" TEXT;
