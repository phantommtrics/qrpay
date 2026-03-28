-- Configuration lives under Organization in the navigation menu (system product nav), not as a separate sidebar item.
UPDATE "SystemProduct"
SET "navPath" = '/configuration', "navLabel" = 'Configuration'
WHERE "slug" = 'business.configuration';
