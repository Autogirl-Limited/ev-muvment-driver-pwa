export type ApiEnvelope<T> = {
  status: "success" | "error";
  message: string;
  data: T | null;
  error: {
    code: string;
    details: { field: string; issue: string }[] | null;
  } | null;
};

export type VirtualAccount = {
  account_name: string;
  account_number: string;
  bank_name: string;
  currency: string;
  status: string;
  banks?: { bank_name: string; account_number: string }[];
};

export type Vehicle = {
  name: string;
  plate_number: string;
  location_state: string;
  vehicle_type?: { name: string } | null;
  vehicle_make?: { name: string };
  vehicle_model?: { name: string };
  pick_up_window?: { start_time: string; end_time: string } | null;
  drop_off_window?: { start_time: string; end_time: string } | null;
};

export type LoginData = {
  status: "success";
  access_token: string;
  refresh_token: string;
  token_type: "bearer";
  has_changed_temporary_password: boolean;
  dva_stats_date: string | null;
  dva_total_amount_received: number | null;
  dva_transaction_count: number | null;
  user: {
    id: string;
    first_name: string;
    last_name: string;
    username: string;
    email: string | null;
    phone_number: string | null;
    ev_wallet_balance: number;
    shift: boolean;
    virtual_account?: VirtualAccount | null;
    vehicle?: Vehicle | null;
  };
  virtual_account: VirtualAccount | null;
  vehicle: Vehicle | null;
};

/** What the browser is allowed to see — everything from login except the tokens. */
export type DriverProfile = Omit<LoginData, "access_token" | "refresh_token" | "token_type" | "status">;

export type FieldErrors = Record<string, string>;

export type DvaStats = {
  date_from: string | null;
  date_to: string | null;
  total_amount_received: number;
  transaction_count: number;
};

export type WalletStats = {
  wallet_balance: number;
  current_rate_per_kwh: number;
  wallet_balance_kwh: number;
  pending_amount: number;
  pending_count: number;
};

export type ChargeStats = {
  date_from: string | null;
  date_to: string | null;
  total_amount_spent: number;
  session_count: number;
};

export type ChecklistPhaseName = "PICK_UP" | "DROP_OFF";
export type ChecklistWindow = { start_time: string; end_time: string };

export type ImageType = "FRONT" | "REAR" | "LEFT" | "RIGHT" | "DASHBOARD";

export type DashboardWarning = { code: string; label: string; severity: "INFO" | "WARNING" | "CRITICAL" };

export type DashboardReading = {
  is_electric?: boolean | null;
  odometer_km?: number | null;
  battery_percent?: number | null;
  range_km?: number | null;
  is_charging?: boolean | null;
  fuel_level_percent?: number | null;
  warnings?: DashboardWarning[] | null;
};

export type ChecklistImage = {
  image_type: ImageType;
  url: string | null;
  analysis: { image_valid: boolean | null; image_issue: string | null; condition: string | null } | null;
};

export type DailyChecklist = {
  id: string;
  phase: ChecklistPhaseName;
  status: "IN_PROGRESS" | "SUBMITTED";
  checklist_date: string;
  started_at: string | null;
  submitted_at: string | null;
  window: ChecklistWindow;
  expected_location: { address: string | null; radius_meters: number } | null;
  images: ChecklistImage[];
  missing_images: ImageType[];
  analysis: { status: "NOT_STARTED" | "PENDING" | "PROCESSING" | "COMPLETED" | "FAILED"; error: string | null };
  dashboard: { effective: DashboardReading | null; driver_edits: DashboardReading | null; driver_edited_at: string | null } | null;
  condition: { status: "GOOD" | "NOT_GOOD" | "UNCLEAR"; summary: string | null } | null;
  comparison: {
    verdict: "NO_CHANGE" | "MINOR_CHANGES" | "NEW_DAMAGE" | "UNCLEAR" | null;
    new_damage: { side: string; type: string; severity: string; description: string }[];
    notes: string | null;
    dashboard_changes: { distance_driven_km?: number | null; battery_percent_change?: number | null } | null;
  } | null;
  flags: { code: string; severity: "INFO" | "WARNING" | "CRITICAL"; message: string }[];
};

export type UploadTarget = {
  image_type: ImageType;
  object_key: string;
  upload_url: string;
  method: string;
  headers: Record<string, string>;
};

export type ChecklistPhase = {
  phase: ChecklistPhaseName;
  state: "UPCOMING" | "OPEN" | "CLOSED";
  window: ChecklistWindow;
  location: { address: string | null; latitude: number; longitude: number; radius_meters: number } | null;
  can_start: boolean;
  checklist: DailyChecklist | null;
};

export type TodayChecklists = {
  checklist_date: string;
  server_time: string;
  vehicle: { id: string; name: string; plate_number: string } | null;
  required_images: string[];
  phases: ChecklistPhase[];
};

export type PickupRequest = {
  id: string;
  requested_date: string;
  requested_start_time: string;
  requested_end_time: string;
  reason: string;
  status: "PENDING" | "APPROVED" | "REJECTED";
  review_notes: string | null;
  created_at: string;
};

export type PickupRequestInput = {
  requested_start_time: string;
  requested_end_time: string;
  reason: string;
};

export type Paginated<T> = { items: T[] };

export type NotificationPriority = "LOW" | "MEDIUM" | "HIGH" | "URGENT";

export type AppNotification = {
  id: string;
  created_at: string;
  title: string;
  description: string;
  priority: NotificationPriority;
  web_url: string | null;
  mobile_app_url: string | null;
  is_read: boolean;
};

export type Page<T> = {
  items: T[];
  pagination: { page: number; page_size: number; total_items: number; total_pages: number; has_next: boolean; has_prev: boolean };
};

export type DvaTransaction = {
  id: string;
  amount: number;
  currency: string;
  payer_name: string | null;
  payer_account_number: string | null;
  payer_bank_name: string | null;
  narration: string | null;
  transaction_reference: string;
  payment_reference: string | null;
  paid_at: string;
  created_at: string;
};

export type ChargerInfo = {
  charger_id: string;
  location_name: string | null;
  connector_type: string | null;
  power_kw: number | null;
  connectors: { connector_id: string; available: boolean }[];
};

export type ChargeQuote = {
  charger_id: string;
  connector_id: string;
  quoted_amount: number;
  currency: string;
  sub_wallet_balance: number;
  soc_percent: number | null;
  vehicle_model: string | null;
};

export type ChargeStarted = { session_id: string; debited: number; remaining_balance: number };

export type ChargeSession = {
  id: string;
  created_at: string;
  lotgrids_session_id: string | null;
  charger_id: string;
  connector_id: string;
  amount: number;
  remaining_balance: number | null;
  energy_kwh: number | null;
};

export type WalletAllocation = {
  id: string;
  created_at: string;
  type: "PAID_TOPUP" | "FREE_GRANT";
  status: "PENDING_PAYMENT" | "AWAITING_ALLOCATION" | "COMPLETED" | "CANCELLED" | "EXPIRED";
  amount: number;
  rate_per_kwh: number;
  kwh_equivalent: number;
  checkout_account_number: string | null;
  checkout_account_name: string | null;
  checkout_bank_name: string | null;
  checkout_expires_at: string | null;
  paid_at: string | null;
  notes: string | null;
};

export type TopupPreview = { amount: number; rate_per_kwh: number; kwh_equivalent: number };
