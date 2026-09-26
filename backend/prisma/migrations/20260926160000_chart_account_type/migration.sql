-- Statement subtype on merchant chart accounts (current vs fixed assets, current vs long-term liabilities, and so on).
DO $$
BEGIN
  CREATE TYPE "ChartAccountType" AS ENUM (
    'CURRENT_ASSET',
    'FIXED_ASSET',
    'INVENTORY',
    'NON_CURRENT_ASSET',
    'PREPAYMENT',
    'CURRENT_LIABILITY',
    'LONG_TERM_LIABILITY',
    'CAPITAL_EQUITY',
    'EXPENSE',
    'DIRECT_COST',
    'DEPRECIATION',
    'OVERHEAD',
    'REVENUE',
    'SALES',
    'OTHER_INCOME'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "ChartOfAccount" ADD COLUMN IF NOT EXISTS "accountType" "ChartAccountType";

-- Built-in catalog codes.
UPDATE "ChartOfAccount" SET "accountType" = 'CURRENT_ASSET'
WHERE "accountType" IS NULL AND code IN (
  'CASH_ON_HAND',
  'MERCHANT_WALLET_CLEARING',
  'MOBILE_MONEY',
  'WAVE_MERCHANT_PAYOUTS',
  'PLATFORM_FUND_TRANSFERS'
);

UPDATE "ChartOfAccount" SET "accountType" = 'PREPAYMENT'
WHERE "accountType" IS NULL AND code = '620';

UPDATE "ChartOfAccount" SET "accountType" = 'CURRENT_LIABILITY'
WHERE "accountType" IS NULL AND code IN ('803', '880', '881');

UPDATE "ChartOfAccount" SET "accountType" = 'CAPITAL_EQUITY'
WHERE "accountType" IS NULL AND code = '970';

UPDATE "ChartOfAccount" SET "accountType" = 'SALES'
WHERE "accountType" IS NULL AND code = '200';

UPDATE "ChartOfAccount" SET "accountType" = 'OTHER_INCOME'
WHERE "accountType" IS NULL AND code = '260';

UPDATE "ChartOfAccount" SET "accountType" = 'DIRECT_COST'
WHERE "accountType" IS NULL AND (
  code = '310' OR upper(code) = 'COGS' OR upper(code) LIKE 'COGS\_%'
);

UPDATE "ChartOfAccount" SET "accountType" = 'EXPENSE'
WHERE "accountType" IS NULL AND code IN (
  '404', '429', '445', '469', 'QR_WALLET_FEES'
);

-- Operating bank accounts are cash, so they sit with current assets.
UPDATE "ChartOfAccount" SET "accountType" = 'CURRENT_ASSET'
WHERE "accountType" IS NULL AND kind = 'BANK';

UPDATE "ChartOfAccount" SET "accountType" = 'FIXED_ASSET'
WHERE "accountType" IS NULL
  AND category = 'ASSET'
  AND (
    code ~* '(FIXED|PPE|EQUIP|FURNITURE|VEHICLE|MACHIN)'
    OR name ~* '(fixed asset|property|plant|equipment|furniture|vehicle|machinery|motor vehicle|\mppe\M)'
  );

UPDATE "ChartOfAccount" SET "accountType" = 'NON_CURRENT_ASSET'
WHERE "accountType" IS NULL
  AND category = 'ASSET'
  AND name ~* '(non-?current asset|long-?term asset)';

UPDATE "ChartOfAccount" SET "accountType" = 'PREPAYMENT'
WHERE "accountType" IS NULL
  AND category = 'ASSET'
  AND name ~* 'prepay';

UPDATE "ChartOfAccount" SET "accountType" = 'INVENTORY'
WHERE "accountType" IS NULL
  AND category = 'ASSET'
  AND name ~* '(inventory|\mstock\M)';

UPDATE "ChartOfAccount" SET "accountType" = 'CURRENT_ASSET'
WHERE "accountType" IS NULL AND category = 'ASSET';

UPDATE "ChartOfAccount" SET "accountType" = 'LONG_TERM_LIABILITY'
WHERE "accountType" IS NULL
  AND category = 'LIABILITY'
  AND (
    code ~* '^NC[_-]'
    OR (code || ' ' || name) ~* '(loan|borrowing|mortgage|term[[:space:]]*loan|long[[:space:]-]*term|debenture)'
  );

UPDATE "ChartOfAccount" SET "accountType" = 'CURRENT_LIABILITY'
WHERE "accountType" IS NULL AND category = 'LIABILITY';

UPDATE "ChartOfAccount" SET "accountType" = 'CAPITAL_EQUITY'
WHERE "accountType" IS NULL AND category = 'EQUITY';

UPDATE "ChartOfAccount" SET "accountType" = 'OTHER_INCOME'
WHERE "accountType" IS NULL
  AND category = 'REVENUE'
  AND name ~* 'other[[:space:]]+(revenue|income)';

UPDATE "ChartOfAccount" SET "accountType" = 'SALES'
WHERE "accountType" IS NULL
  AND category = 'REVENUE'
  AND (name ~* '\msales?\M' OR code ~* 'SALES');

UPDATE "ChartOfAccount" SET "accountType" = 'REVENUE'
WHERE "accountType" IS NULL AND category = 'REVENUE';

UPDATE "ChartOfAccount" SET "accountType" = 'DIRECT_COST'
WHERE "accountType" IS NULL
  AND category = 'EXPENSE'
  AND (
    upper(code) = 'COGS'
    OR upper(code) LIKE 'COGS\_%'
    OR name ~* '(cost of goods|cost of sales|direct cost)'
  );

UPDATE "ChartOfAccount" SET "accountType" = 'DEPRECIATION'
WHERE "accountType" IS NULL
  AND category = 'EXPENSE'
  AND name ~* 'depreciat';

UPDATE "ChartOfAccount" SET "accountType" = 'OVERHEAD'
WHERE "accountType" IS NULL
  AND category = 'EXPENSE'
  AND name ~* '\moverhead\M';

UPDATE "ChartOfAccount" SET "accountType" = 'EXPENSE'
WHERE "accountType" IS NULL AND category = 'EXPENSE';
