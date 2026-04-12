-- Business Configuration is linked from the app sidebar only, not from catalog nav (avoids duplicate menu item).
UPDATE "SystemProduct"
SET "navPath" = NULL, "navLabel" = NULL
WHERE "slug" = 'business.configuration';
