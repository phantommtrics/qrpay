export type PermissionKey =
  | 'platform.manage'
  | 'platform.users.manage'
  | 'platform.businesses.manage'
  | 'platform.billing.manage'
  | 'business.manage'
  | 'staff.manage'
  | 'products.manage'
  | 'products.view'
  | 'products.create'
  | 'products.edit'
  | 'products.delete'
  | 'orders.manage'
  | 'orders.view'
  | 'orders.create'
  | 'orders.edit'
  | 'orders.delete'
  | 'payments.manage'
  | 'payments.view'
  | 'payments.create'
  | 'payments.edit'
  | 'payments.delete'
  | 'reports.view'
  | 'accounting.view'
  | 'pos.access'
  | 'dashboard.view';

export interface Permission {
  id: string;
  key: PermissionKey;
  name: string;
  description: string;
  category: 'Views' | 'Actions' | 'Reports' | 'Administration' | 'Operations';
}

export interface Role {
  id: string;
  name: string;
  description: string;
  isSystem: boolean;
  permissions: PermissionKey[];
}

export const SYSTEM_ROLES: Role[] = [
  {
    id: 'role_platform_owner',
    name: 'Platform Owner',
    description: 'Full platform administration access',
    isSystem: true,
    permissions: [
      'platform.manage',
      'platform.users.manage',
      'platform.businesses.manage',
      'platform.billing.manage',
      'business.manage',
      'staff.manage',
      'products.manage',
      'products.view',
      'products.create',
      'orders.manage',
      'orders.view',
      'payments.manage',
      'payments.view',
      'reports.view',
      'accounting.view',
      'pos.access',
      'dashboard.view'
    ]
  },
  {
    id: 'role_business_admin',
    name: 'Business Admin',
    description: 'Business administration and management',
    isSystem: true,
    permissions: [
      'business.manage',
      'staff.manage',
      'products.manage',
      'products.view',
      'products.create',
      'orders.manage',
      'orders.view',
      'payments.manage',
      'payments.view',
      'reports.view',
      'accounting.view',
      'pos.access',
      'dashboard.view'
    ]
  },
  {
    id: 'role_business_staff',
    name: 'Business Staff',
    description: 'Regular business staff with limited access',
    isSystem: true,
    permissions: [
      'products.view',
      'orders.view',
      'orders.manage',
      'payments.view',
      'pos.access',
      'dashboard.view'
    ]
  },
  {
    id: 'role_cashier',
    name: 'Cashier',
    description: 'POS and checkout operations only',
    isSystem: true,
    permissions: [
      'pos.access',
      'products.view',
      'orders.manage'
    ]
  }
];

export const SYSTEM_PERMISSIONS: Permission[] = [
  // Platform permissions
  {
    id: 'perm_platform_manage',
    key: 'platform.manage',
    name: 'Platform Management',
    description: 'Manage platform settings and configurations',
    category: 'Administration'
  },
  {
    id: 'perm_platform_users',
    key: 'platform.users.manage',
    name: 'Platform Users',
    description: 'Manage platform-level users',
    category: 'Administration'
  },
  {
    id: 'perm_platform_businesses',
    key: 'platform.businesses.manage',
    name: 'Platform Businesses',
    description: 'Manage all businesses on platform',
    category: 'Administration'
  },
  {
    id: 'perm_platform_billing',
    key: 'platform.billing.manage',
    name: 'Platform Billing',
    description: 'Manage platform billing and subscriptions',
    category: 'Administration'
  },

  // Business permissions
  {
    id: 'perm_business_manage',
    key: 'business.manage',
    name: 'Business Management',
    description: 'Manage business settings and configurations',
    category: 'Administration'
  },
  {
    id: 'perm_staff_manage',
    key: 'staff.manage',
    name: 'Staff Management',
    description: 'Manage business staff and roles',
    category: 'Administration'
  },
  {
    id: 'perm_products_manage',
    key: 'products.manage',
    name: 'Products Management',
    description: 'Full CRUD operations on products',
    category: 'Administration'
  },
  {
    id: 'perm_products_view',
    key: 'products.view',
    name: 'Products View',
    description: 'View products catalog',
    category: 'Views'
  },
  {
    id: 'perm_products_create',
    key: 'products.create',
    name: 'Products Create',
    description: 'Create new products',
    category: 'Operations'
  },
  {
    id: 'perm_orders_manage',
    key: 'orders.manage',
    name: 'Orders Management',
    description: 'Manage orders and transactions',
    category: 'Actions'
  },
  {
    id: 'perm_orders_view',
    key: 'orders.view',
    name: 'Orders View',
    description: 'View orders and transactions',
    category: 'Views'
  },
  {
    id: 'perm_payments_manage',
    key: 'payments.manage',
    name: 'Payments Management',
    description: 'Manage payment records',
    category: 'Actions'
  },
  {
    id: 'perm_payments_view',
    key: 'payments.view',
    name: 'Payments View',
    description: 'View payment records',
    category: 'Views'
  },
  {
    id: 'perm_reports_view',
    key: 'reports.view',
    name: 'Reports View',
    description: 'Access business reports',
    category: 'Reports'
  },
  {
    id: 'perm_accounting_view',
    key: 'accounting.view',
    name: 'Accounting View',
    description: 'Access accounting features',
    category: 'Reports'
  },
  {
    id: 'perm_pos_access',
    key: 'pos.access',
    name: 'POS Access',
    description: 'Access point of sale system',
    category: 'Operations'
  },
  {
    id: 'perm_dashboard_view',
    key: 'dashboard.view',
    name: 'Dashboard View',
    description: 'Access business dashboard',
    category: 'Views'
  }
];