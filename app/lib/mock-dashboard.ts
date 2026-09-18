import type { HomeDashboard } from "./domain";

export const mockHomeDashboard: HomeDashboard = {
  driver: {
    id: "driver_001",
    firstName: "Chidinma",
    lastName: "Njoku",
    driverCode: "PILOT-1042",
  },
  shift: {
    id: "shift_2026_09_16",
    status: "ON_SHIFT",
    serverTime: "2026-09-16T10:25:00+01:00",
    pickupAt: "2026-09-16T06:17:00+01:00",
    expectedShiftEndAt: "2026-09-16T18:17:00+01:00",
    absoluteDropoffDeadlineAt: "2026-09-16T23:00:00+01:00",
    pickupWindow: {
      startsAt: "2026-09-16T05:00:00+01:00",
      endsAt: "2026-09-16T07:00:00+01:00",
    },
    vehicle: {
      id: "vehicle_014",
      code: "MUV-EV-014",
      model: "BYD Dolphin",
      plateNumber: "ABC-123XY",
    },
    charging: {
      allowanceKwh: 30,
      usedKwh: 21.8,
      remainingKwh: 8.2,
    },
    alerts: [
      {
        id: "alert_shift_deadline",
        severity: "WARNING",
        title: "Drop-off deadline",
        message: "Final drop-off deadline is 11:00 PM today.",
      },
      {
        id: "alert_charging_usage",
        severity: "INFO",
        title: "Charging allowance at 73%",
        message: "You have 8.2 kWh remaining for this shift.",
      },
    ],
  },
};
