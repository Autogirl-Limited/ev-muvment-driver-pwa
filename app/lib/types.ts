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

export type DailyChecklist = {
  id: string;
  phase: ChecklistPhaseName;
  status: "IN_PROGRESS" | "SUBMITTED";
  started_at: string | null;
  submitted_at: string | null;
  missing_images: string[];
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
