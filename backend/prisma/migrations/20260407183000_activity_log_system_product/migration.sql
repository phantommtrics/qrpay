-- Activity log: Organization service system product + plan entitlements (slug activity.log).
INSERT INTO "SystemProduct" (
  "id",
  "serviceId",
  "name",
  "slug",
  "description",
  "sortOrder",
  "navPath",
  "navLabel",
  "createdAt",
  "updatedAt"
)
VALUES (
  'sp_activity_log',
  'svc_org',
  'Activity log',
  'activity.log',
  'Audit trail: payments, product changes, and staff actions',
  6,
  '/activity-log',
  'Activity log',
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
)
ON CONFLICT ("slug") DO UPDATE SET
  "serviceId" = EXCLUDED."serviceId",
  "name" = EXCLUDED."name",
  "description" = EXCLUDED."description",
  "sortOrder" = EXCLUDED."sortOrder",
  "navPath" = EXCLUDED."navPath",
  "navLabel" = EXCLUDED."navLabel",
  "updatedAt" = CURRENT_TIMESTAMP;

INSERT INTO "PlanSystemProduct" ("id", "planId", "systemProductId")
SELECT gen_random_uuid()::text, pl."id", sp."id"
FROM "Plan" pl
CROSS JOIN "SystemProduct" sp
WHERE sp."slug" = 'activity.log'
  AND NOT EXISTS (
    SELECT 1
    FROM "PlanSystemProduct" x
    WHERE x."planId" = pl."id"
      AND x."systemProductId" = sp."id"
  );
