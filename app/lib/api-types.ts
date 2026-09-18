export type ResponseStatus = "success" | "error";

export type GenericResponse<T> = {
  status: ResponseStatus;
  message: string;
  data?: T | null;
  error?: {
    code: string;
    details?: Record<string, string>[] | null;
  } | null;
};

export type UserType =
  | "ADMIN"
  | "RELATIONSHIP_OFFICER"
  | "DRIVER"
  | "ACCOUNT_OFFICER";

export type VirtualAccount = {
  id: string;
  created_at: string;
  updated_at: string;
  provider: "MONNIFY";
  account_name: string;
  account_number: string;
  bank_name: string;
  bank_code: string;
  currency: string;
  status: "ACTIVE" | "INACTIVE";
};

export type User = {
  id: string;
  created_at: string;
  updated_at: string;
  first_name: string;
  last_name: string;
  username: string;
  email: string | null;
  phone_number: string | null;
  user_type: UserType;
  is_active: boolean;
  two_factor_enabled: boolean;
  totp_enabled: boolean;
  ev_wallet_balance: number;
  virtual_account?: VirtualAccount | null;
};

export type LoginResponse = {
  status: "success" | "two_factor_required";
  two_factor_method?: "EMAIL_OTP" | "TOTP" | null;
  challenge_token?: string | null;
  user?: User | null;
  access_token?: string | null;
  refresh_token?: string | null;
  token_type?: string | null;
  virtual_account?: VirtualAccount | null;
};

export type LoginRequest = {
  identifier: string;
  password: string;
};

export type NotificationPriority = "LOW" | "MEDIUM" | "HIGH" | "URGENT";

export type DriverNotification = {
  id: string;
  created_at: string;
  updated_at: string;
  title: string;
  description: string;
  priority: NotificationPriority;
  web_url: string | null;
  mobile_app_url: string | null;
  is_read: boolean;
};

export type PaginationMeta = {
  page: number;
  page_size: number;
  total_items: number;
  total_pages: number;
  has_next: boolean;
  has_prev: boolean;
};

export type PaginatedResult<T> = {
  items: T[];
  pagination: PaginationMeta;
};
