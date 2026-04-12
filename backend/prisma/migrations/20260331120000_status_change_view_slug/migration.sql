-- Rename catalog entitlement slug and expose nav entry for staff access status page.
UPDATE "SystemProduct"
SET
  slug = 'status.change.view',
  "navPath" = '/staff/status',
  "navLabel" = 'Staff access status'
WHERE id = 'sp_staff_status' OR slug = 'staff.change-status';
