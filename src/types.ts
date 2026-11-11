export interface AuthUser {
  userId: number;
  personId: number;
  username: string;
  fullName: string;
  phone: string;
  personType: string;
  department: string;
  jobTitle: string;
  roleId: number;
  roleKey: string;
  roleNameAr: string;
  mustChangePassword: boolean;
  permissions: string[];
}

export interface CharitySettings {
  name_ar: string;
  tagline_ar: string;
  registration_number: string;
  address_ar: string;
  phone: string;
  email: string;
  website_domain: string;
  donation_instructions_ar: string;
  bank_transfer_info_ar: string;
  vodafone_cash_info_ar: string;
  instapay_info_ar: string;
  receipt_footer_ar?: string;
}

export interface PublicProject {
  id: number;
  code: string;
  record_kind?: 'project' | 'campaign';
  is_demo?: number;
  title_ar: string;
  category_ar: string;
  description_ar: string;
  goal_ar: string;
  image_url: string;
  target_budget: number;
  fund_type: 'general' | 'zakat' | 'restricted';
  start_date: string;
  end_date: string;
  status: string;
  is_public?: number;
  manager_person_id?: number | null;
  manager_name?: string | null;
  approved_donations: number;
  pending_donations?: number;
  approved_expenses: number;
  remaining_balance: number;
  funding_percentage: number;
}

export interface PersonRecord {
  id: number;
  full_name: string;
  phone: string;
  national_id: string;
  email: string;
  address: string;
  area: string;
  person_type: 'admin' | 'employee' | 'donor' | 'beneficiary' | 'volunteer' | 'official';
  department: string;
  job_title: string;
  join_date: string;
  manager_person_id: number | null;
  manager_name?: string | null;
  notes: string;
  status: 'active' | 'suspended' | 'archived';
  user_id: number | null;
  username: string | null;
  account_status: string | null;
  last_login_at: string | null;
  role_id: number | null;
  role_key: string | null;
  role_name_ar: string | null;
  is_demo?: number;
  created_at: string;
}

export interface RoleRecord {
  id: number;
  role_key: string;
  name_ar: string;
  description_ar: string;
  is_system: number;
  permissions: string[];
}

export interface PermissionCatalogGroup {
  module: string;
  moduleLabel: string;
  actions: { key: string; label: string }[];
}

export interface DonationRecord {
  id: number;
  reference_code: string;
  donor_person_id: number;
  donor_name?: string;
  donor_phone?: string;
  donation_type: string;
  project_id: number | null;
  project_title?: string | null;
  case_category_label: string;
  amount: number;
  payment_method: string;
  transaction_ref: string;
  donation_date: string;
  proof_file_id: string | null;
  proof_file_name?: string | null;
  proof_mime_type?: string | null;
  donor_notes: string;
  status: 'pending_review' | 'in_review' | 'needs_clarification' | 'approved' | 'rejected' | 'cancelled';
  financial_account_id: number | null;
  account_name?: string | null;
  is_zakat: number;
  internal_note: string;
  rejection_reason: string;
  clarification_request: string;
  reviewed_by_name?: string | null;
  reviewed_at?: string | null;
  approved_by_name?: string | null;
  approved_at?: string | null;
  receipt_id?: number | null;
  receipt_number?: string | null;
  is_demo?: number;
  created_at: string;
}

export interface ReceiptRecord {
  id: number;
  receipt_number: string;
  donation_id: number;
  reference_code?: string;
  donation_status?: string;
  donor_person_id: number;
  donor_name: string;
  amount: number;
  amount_words_ar: string;
  donation_type_label: string;
  project_title: string;
  payment_method: string;
  donation_date: string;
  approved_by_name: string;
  approved_at: string;
  verification_hash: string;
  print_count: number;
  is_demo?: number;
  created_at: string;
}

export interface DonationReviewHistoryItem {
  id: number;
  action: string;
  previous_status: string;
  new_status: string;
  note: string;
  created_at: string;
}

export interface PublishedExpenseItem {
  id: number;
  voucher_number: string;
  title_ar: string;
  category_ar: string;
  description_ar: string;
  amount: number;
  expense_date: string;
  project_id: number | null;
  project_title?: string;
  attachment_file_id: string | null;
  attachment_name?: string | null;
  attachment_mime_type?: string | null;
  is_public_attachment?: number;
  is_demo?: number;
}

export interface ProjectUpdateItem {
  id: number;
  project_id: number;
  project_title?: string;
  title_ar: string;
  details_ar: string;
  progress_percent: number;
  file_id?: string | null;
  created_at: string;
}

export interface FinancialAccount {
  id: number;
  name_ar: string;
  account_type: 'cash_safe' | 'bank' | 'wallet';
  fund_type: 'general' | 'zakat' | 'restricted';
  account_number: string;
  bank_name: string;
  current_balance: number | null;
  is_active: number;
  is_demo?: number;
  notes: string;
}

export interface ExpenseRecord {
  id: number;
  voucher_number: string;
  title_ar: string;
  category_ar: string;
  amount: number;
  expense_date: string;
  project_id: number | null;
  project_title?: string | null;
  case_id: number | null;
  case_file_number?: string | null;
  financial_account_id: number;
  account_name?: string;
  is_zakat_expense: number;
  beneficiary_or_vendor: string;
  description_ar: string;
  attachment_file_id: string | null;
  attachment_name?: string | null;
  attachment_mime_type?: string | null;
  is_public_attachment?: number;
  status: 'pending_approval' | 'approved' | 'paid' | 'rejected' | 'cancelled';
  created_by_name?: string;
  approved_by_name?: string;
  is_demo?: number;
  created_at: string;
}

export interface HumanitarianCase {
  id: number;
  file_number: string;
  beneficiary_person_id: number;
  beneficiary_name: string;
  beneficiary_phone: string;
  beneficiary_area: string;
  beneficiary_address: string;
  case_type: string;
  description_ar: string;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  family_size: number;
  requested_amount: number;
  status: 'new' | 'under_research' | 'approved' | 'rejected' | 'assisted' | 'closed';
  assigned_person_id: number | null;
  assigned_staff_name?: string | null;
  aids_count: number;
  total_aids_amount: number;
  is_demo?: number;
  updated_at: string;
}

export interface AidRecord {
  id: number;
  aid_number: string;
  case_id: number;
  case_file_number: string;
  case_type: string;
  beneficiary_name: string;
  aid_type: string;
  delivery_mode: 'financial' | 'in_kind';
  amount: number;
  inventory_item_id: number | null;
  item_name?: string | null;
  item_unit?: string | null;
  quantity: number;
  funding_source_label: string;
  financial_account_id: number | null;
  account_name?: string | null;
  project_id: number | null;
  project_title?: string | null;
  is_zakat: number;
  aid_date: string;
  responsible_name?: string | null;
  attachment_file_id: string | null;
  notes: string;
  status: 'pending' | 'approved' | 'disbursed' | 'rejected';
  is_demo?: number;
  created_at: string;
}

export interface InventoryItem {
  id: number;
  item_code: string;
  name_ar: string;
  category_ar: string;
  unit_ar: string;
  current_qty: number;
  min_threshold: number;
  notes: string;
  is_demo?: number;
  updated_at: string;
}

export interface InventoryMovement {
  id: number;
  movement_number: string;
  item_id: number;
  item_name: string;
  item_unit: string;
  movement_type: 'inbound' | 'outbound';
  quantity: number;
  qty_after: number;
  movement_date: string;
  source_or_recipient: string;
  responsible_name?: string | null;
  attachment_file_id: string | null;
  notes: string;
  is_demo?: number;
  created_at: string;
}

export interface NotificationItem {
  id: number;
  title_ar: string;
  message_ar: string;
  category: string;
  link_tab: string;
  is_read: number;
  is_demo?: number;
  created_at: string;
}
