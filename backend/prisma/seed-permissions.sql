-- Deprecated: prefer `npm run prisma:seed` (prisma/seed.ts), which inserts the same RBAC rows via Prisma into the tables defined in schema.prisma.
-- Kept for reference or one-off manual runs only.

-- Create roles table and seed data
INSERT INTO "Role" (id, name, description, "isSystem") VALUES
('role_platform_owner', 'Platform Owner', 'Full platform administration access', true),
('role_business_admin', 'Business Admin', 'Business administration and management', true),
('role_business_staff', 'Business Staff', 'Regular business staff with limited access', true),
('role_cashier', 'Cashier', 'POS and checkout operations only', true);

-- Create permissions table
INSERT INTO "Permission" (id, key, name, description, category) VALUES
-- Platform permissions
('perm_platform_manage', 'platform.manage', 'Platform Management', 'Manage platform settings and configurations', 'Administration'),
('perm_platform_users', 'platform.users.manage', 'Platform Users', 'Manage platform-level users', 'Administration'),
('perm_platform_businesses', 'platform.businesses.manage', 'Platform Businesses', 'Manage all businesses on platform', 'Administration'),
('perm_platform_billing', 'platform.billing.manage', 'Platform Billing', 'Manage platform billing and subscriptions', 'Administration'),

-- Business permissions
('perm_business_manage', 'business.manage', 'Business Management', 'Manage business settings and configurations', 'Administration'),
('perm_staff_manage', 'staff.manage', 'Staff Management', 'Manage business staff and roles', 'Administration'),
('perm_products_manage', 'products.manage', 'Products Management', 'Full CRUD operations on products', 'Products'),
('perm_products_view', 'products.view', 'Products View', 'View products catalog', 'Products'),
('perm_orders_manage', 'orders.manage', 'Orders Management', 'Manage orders and transactions', 'Orders'),
('perm_orders_view', 'orders.view', 'Orders View', 'View orders and transactions', 'Orders'),
('perm_payments_manage', 'payments.manage', 'Payments Management', 'Manage payment records', 'Payments'),
('perm_payments_view', 'payments.view', 'Payments View', 'View payment records', 'Payments'),
('perm_reports_view', 'reports.view', 'Reports View', 'Access business reports', 'Reports'),
('perm_accounting_view', 'accounting.view', 'Accounting View', 'Access accounting features', 'Accounting'),
('perm_pos_access', 'pos.access', 'POS Access', 'Access point of sale system', 'Operations'),
('perm_dashboard_view', 'dashboard.view', 'Dashboard View', 'Access business dashboard', 'Views');

-- Assign permissions to roles
INSERT INTO "RolePermission" (id, "roleId", "permissionId") VALUES
-- Platform Owner - All permissions
('rp_po_1', 'role_platform_owner', 'perm_platform_manage'),
('rp_po_2', 'role_platform_owner', 'perm_platform_users'),
('rp_po_3', 'role_platform_owner', 'perm_platform_businesses'),
('rp_po_4', 'role_platform_owner', 'perm_platform_billing'),
('rp_po_5', 'role_platform_owner', 'perm_business_manage'),
('rp_po_6', 'role_platform_owner', 'perm_staff_manage'),
('rp_po_7', 'role_platform_owner', 'perm_products_manage'),
('rp_po_8', 'role_platform_owner', 'perm_products_view'),
('rp_po_9', 'role_platform_owner', 'perm_orders_manage'),
('rp_po_10', 'role_platform_owner', 'perm_orders_view'),
('rp_po_11', 'role_platform_owner', 'perm_payments_manage'),
('rp_po_12', 'role_platform_owner', 'perm_payments_view'),
('rp_po_13', 'role_platform_owner', 'perm_reports_view'),
('rp_po_14', 'role_platform_owner', 'perm_accounting_view'),
('rp_po_15', 'role_platform_owner', 'perm_pos_access'),
('rp_po_16', 'role_platform_owner', 'perm_dashboard_view'),

-- Business Admin - Business management permissions
('rp_ba_1', 'role_business_admin', 'perm_business_manage'),
('rp_ba_2', 'role_business_admin', 'perm_staff_manage'),
('rp_ba_3', 'role_business_admin', 'perm_products_manage'),
('rp_ba_4', 'role_business_admin', 'perm_products_view'),
('rp_ba_5', 'role_business_admin', 'perm_orders_manage'),
('rp_ba_6', 'role_business_admin', 'perm_orders_view'),
('rp_ba_7', 'role_business_admin', 'perm_payments_manage'),
('rp_ba_8', 'role_business_admin', 'perm_payments_view'),
('rp_ba_9', 'role_business_admin', 'perm_reports_view'),
('rp_ba_10', 'role_business_admin', 'perm_accounting_view'),
('rp_ba_11', 'role_business_admin', 'perm_pos_access'),
('rp_ba_12', 'role_business_admin', 'perm_dashboard_view'),

-- Business Staff - Limited permissions
('rp_bs_1', 'role_business_staff', 'perm_products_view'),
('rp_bs_2', 'role_business_staff', 'perm_orders_view'),
('rp_bs_3', 'role_business_staff', 'perm_orders_manage'),
('rp_bs_4', 'role_business_staff', 'perm_payments_view'),
('rp_bs_5', 'role_business_staff', 'perm_pos_access'),
('rp_bs_6', 'role_business_staff', 'perm_dashboard_view'),

-- Cashier - Minimal permissions
('rp_ca_1', 'role_cashier', 'perm_pos_access'),
('rp_ca_2', 'role_cashier', 'perm_products_view'),
('rp_ca_3', 'role_cashier', 'perm_orders_manage');