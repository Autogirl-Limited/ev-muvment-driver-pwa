import assert from "node:assert/strict";
import test from "node:test";
import { addDays, calendarDays, dateFilterLabel, resolveDateFilter, shiftMonth } from "../app/lib/date-range.ts";
import { bankIdentity, paymentAccounts } from "../app/lib/banks.ts";

test("presets use inclusive calendar days across year and leap-day boundaries", () => {
  assert.deepEqual(resolveDateFilter({ preset: "today" }, "2026-01-02"), { from: "2026-01-02", to: "2026-01-02" });
  assert.deepEqual(resolveDateFilter({ preset: "week" }, "2026-01-02"), { from: "2025-12-27", to: "2026-01-02" });
  assert.deepEqual(resolveDateFilter({ preset: "month" }, "2024-02-29"), { from: "2024-02-01", to: "2024-02-29" });
  assert.deepEqual(resolveDateFilter({ preset: "all" }, "2026-01-02"), {});
  assert.equal(addDays("2024-03-01", -1), "2024-02-29");
});

test("custom dates are sent unchanged, including one-day and cross-year ranges", () => {
  const filter = { preset: "custom", from: "2025-12-31", to: "2026-01-02" };
  assert.deepEqual(resolveDateFilter(filter, "2026-09-24"), { from: filter.from, to: filter.to });
  assert.match(dateFilterLabel(filter), /25.*26/);
  assert.equal(dateFilterLabel({ preset: "custom", from: "2026-09-01", to: "2026-09-01" }), "1 Sept");
});

test("calendar navigation clamps month ends and maintains a Monday-first six-week grid", () => {
  assert.equal(shiftMonth("2024-01-31", 1), "2024-02-29");
  assert.equal(shiftMonth("2025-01-31", 1), "2025-02-28");
  assert.equal(shiftMonth("2026-01-01", -1), "2025-12-01");
  const days = calendarDays("2026-09-01");
  assert.equal(days.length, 42);
  assert.equal(days[0], "2026-08-31");
  assert.equal(days.at(-1), "2026-10-11");
});

test("bank names resolve to supplied logos despite case, spaces, and suffixes", () => {
  assert.equal(bankIdentity("MoniePoint Microfinance Bank").key, "moniepoint");
  assert.equal(bankIdentity("MONIE POINT MFB").logo, "/images/bank/moniepoint-logo.svg");
  assert.equal(bankIdentity("Wema Bank PLC").key, "wema");
  assert.equal(bankIdentity("Sterling Bank").key, "sterling");
  assert.equal(bankIdentity("Another bank").logo, null);
});

test("combine account sources, deduplicate aliases, and keep identical numbers at different banks", () => {
  const main = { bank_name: "Moniepoint MFB", account_number: "0123456789", account_name: "Test Driver",
    banks: [{ bank_name: "Wema Bank", account_number: "0123456789" }, { bank_name: "Sterling Bank", account_number: "" }] };
  const profile = { virtual_account: main, user: { virtual_account: { ...main, bank_name: "MONIE POINT", banks: [{ bank_name: "Sterling Bank", account_number: "0987654321" }] } } };
  const accounts = paymentAccounts(profile);
  assert.equal(accounts.length, 3);
  assert.deepEqual(accounts.map((a) => a.bank_name), ["Moniepoint MFB", "Wema Bank", "Sterling Bank"]);
  assert.ok(accounts.every((a) => a.account_name === "Test Driver"));
  assert.deepEqual(paymentAccounts({ virtual_account: null, user: {} }), []);
});
