export type ShiftStatus =
  | "AWAITING_PICKUP"
  | "ON_SHIFT"
  | "ENDING_SOON"
  | "OVERDUE"
  | "DROPPED_OFF";

export type AlertSeverity = "INFO" | "WARNING" | "CRITICAL";

export type Driver = {
  id: string;
  firstName: string;
  lastName: string;
  driverCode: string;
};

export type Vehicle = {
  id: string;
  code: string;
  model: string;
  plateNumber: string;
  imageUrl?: string;
};

export type ChargingAllowance = {
  allowanceKwh: number;
  usedKwh: number;
  remainingKwh: number;
};

export type OperationalAlert = {
  id: string;
  severity: AlertSeverity;
  title: string;
  message: string;
};

export type CurrentShift = {
  id: string;
  status: ShiftStatus;
  pickupWindow: {
    startsAt: string;
    endsAt: string;
  };
  pickupAt?: string;
  expectedShiftEndAt?: string;
  absoluteDropoffDeadlineAt?: string;
  serverTime: string;
  vehicle?: Vehicle;
  charging: ChargingAllowance;
  alerts: OperationalAlert[];
};

export type HomeDashboard = {
  driver: Driver;
  shift: CurrentShift;
};
