"use client";

import { useId, useRef, useState, type KeyboardEvent } from "react";
import { CalendarDays, Check, ChevronDown, ChevronLeft, ChevronRight, X } from "lucide-react";
import { lagosDate } from "../lib/format";
import {
  addDays, calendarDays, DATE_PRESETS, dateFilterLabel, dateFromKey,
  formatCalendarDate, resolveDateFilter, shiftMonth, type DateFilter,
} from "../lib/date-range";
import { Modal } from "./Modal";
import styles from "./DateRangeFilter.module.css";

type Props = {
  value: DateFilter;
  onChange: (value: DateFilter) => void;
  label?: string;
  className?: string;
  /** Latest selectable calendar date (YYYY-MM-DD); defaults to today in Lagos. */
  maxDate?: string;
};

export function DateRangeFilter({ value, onChange, label = "Filter by date", className, maxDate = lagosDate() }: Props) {
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  function close() {
    setOpen(false);
    requestAnimationFrame(() => trigger.current?.focus({ preventScroll: true }));
  }
  return (
    <>
      <button
        ref={trigger}
        type="button"
        className={className ?? styles.trigger}
        aria-label={`${label}: ${dateFilterLabel(value)}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen(true)}
      >
        <CalendarDays size={14} aria-hidden="true" />
        {dateFilterLabel(value)}
        <ChevronDown size={13} aria-hidden="true" />
      </button>
      <Modal label={label} open={open} onClose={close} panelClassName={styles.panel}>
        <DateRangeEditor
          value={value}
          maxDate={maxDate}
          label={label}
          onCancel={close}
          onApply={(next) => { onChange(next); close(); }}
        />
      </Modal>
    </>
  );
}

function DateRangeEditor({ value, maxDate, label, onCancel, onApply }: {
  value: DateFilter; maxDate: string; label: string; onCancel: () => void; onApply: (value: DateFilter) => void;
}) {
  const initial = resolveDateFilter(value, maxDate);
  const [preset, setPreset] = useState<DateFilter["preset"]>(value.preset);
  const [from, setFrom] = useState(initial.from ?? "");
  const [to, setTo] = useState(initial.to ?? "");
  const [month, setMonth] = useState((initial.to ?? maxDate).slice(0, 7) + "-01");
  const [focused, setFocused] = useState(initial.to ?? maxDate);
  const [hovered, setHovered] = useState("");
  const dayButtons = useRef(new Map<string, HTMLButtonElement>());
  const monthId = useId();
  const hintId = useId();
  const days = calendarDays(month);
  const end = to || hovered;
  const rangeStart = end && from ? (from < end ? from : end) : from;
  const rangeEnd = end && from ? (from < end ? end : from) : "";
  const complete = preset !== "custom" || Boolean(from && to && from <= to && to <= maxDate);

  function selectPreset(next: DateFilter["preset"]) {
    setPreset(next);
    setHovered("");
    if (next === "custom") {
      setFrom("");
      setTo("");
      return;
    }
    const range = resolveDateFilter({ preset: next }, maxDate);
    setFrom(range.from ?? "");
    setTo(range.to ?? "");
    setMonth(`${(range.to ?? maxDate).slice(0, 7)}-01`);
    setFocused(range.to ?? maxDate);
  }

  function selectDay(day: string) {
    setPreset("custom");
    setHovered("");
    setFocused(day);
    if (preset !== "custom" || !from || to) {
      setFrom(day);
      setTo("");
    } else {
      setFrom(day < from ? day : from);
      setTo(day < from ? from : day);
    }
  }

  function moveMonth(offset: number) {
    const next = shiftMonth(month, offset);
    setMonth(next);
    setFocused(next.slice(0, 7) === maxDate.slice(0, 7) ? maxDate : next);
  }

  function onDayKey(event: KeyboardEvent<HTMLButtonElement>, day: string) {
    const weekday = (dateFromKey(day).getUTCDay() + 6) % 7;
    const next = event.key === "ArrowLeft" ? addDays(day, -1)
      : event.key === "ArrowRight" ? addDays(day, 1)
      : event.key === "ArrowUp" ? addDays(day, -7)
      : event.key === "ArrowDown" ? addDays(day, 7)
      : event.key === "Home" ? addDays(day, -weekday)
      : event.key === "End" ? addDays(day, 6 - weekday)
      : event.key === "PageUp" ? shiftMonth(day, -1)
      : event.key === "PageDown" ? shiftMonth(day, 1) : null;
    if (!next) return;
    event.preventDefault();
    const bounded = next > maxDate ? maxDate : next;
    setFocused(bounded);
    setMonth(`${bounded.slice(0, 7)}-01`);
    requestAnimationFrame(() => dayButtons.current.get(bounded)?.focus());
  }

  return (
    <div className={styles.editor}>
      <header className={styles.heading}>
        <span className={styles.icon}><CalendarDays size={21} /></span>
        <div><h2>{label}</h2><p>A day, a week, or your own range.</p></div>
        <button type="button" className={styles.iconButton} onClick={onCancel} aria-label="Close date filter"><X size={19} /></button>
      </header>

      <div className={styles.presets} aria-label="Date presets">
        {DATE_PRESETS.map((item) => (
          <button key={item.key} type="button" aria-pressed={preset === item.key} onClick={() => selectPreset(item.key)}>
            {preset === item.key ? <Check size={13} /> : null}{item.label}
          </button>
        ))}
      </div>

      <div className={styles.range}>
        <div data-active={preset === "custom" && !from}><small>Start date</small><strong>{from ? formatCalendarDate(from, { year: "numeric" }) : preset === "all" ? "First activity" : "Select a day"}</strong></div>
        <span aria-hidden="true">→</span>
        <div data-active={preset === "custom" && Boolean(from) && !to}><small>End date</small><strong>{to ? formatCalendarDate(to, { year: "numeric" }) : preset === "all" ? "Today" : "Select a day"}</strong></div>
      </div>

      <div className={styles.monthNav}>
        <h3 id={monthId} aria-live="polite">{formatCalendarDate(month, { day: undefined, month: "long", year: "numeric" })}</h3>
        <div>
          <button type="button" className={styles.iconButton} onClick={() => moveMonth(-1)} aria-label="Previous month"><ChevronLeft size={19} /></button>
          <button type="button" className={styles.iconButton} onClick={() => moveMonth(1)} disabled={month.slice(0, 7) >= maxDate.slice(0, 7)} aria-label="Next month"><ChevronRight size={19} /></button>
        </div>
      </div>

      <div role="grid" aria-labelledby={monthId} aria-describedby={hintId} className={styles.calendar} onMouseLeave={() => setHovered("")}>
        <div role="row" className={styles.week}>
          {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((day) => <span key={day} role="columnheader" className={styles.weekday}>{day}</span>)}
        </div>
        {Array.from({ length: 6 }, (_, week) => (
          <div role="row" className={styles.week} key={week}>
            {days.slice(week * 7, week * 7 + 7).map((day) => {
              const selected = Boolean(from && to && day >= from && day <= to);
              const inRange = Boolean(rangeStart && rangeEnd && day >= rangeStart && day <= rangeEnd);
              const edge = day === from || day === to;
              return (
                <div role="gridcell" aria-selected={selected || day === from} key={day}
                  className={styles.cell} data-range={inRange} data-start={day === rangeStart} data-end={day === rangeEnd}>
                  <button
                    ref={(node) => { if (node) dayButtons.current.set(day, node); else dayButtons.current.delete(day); }}
                    type="button"
                    className={styles.day}
                    data-outside={day.slice(0, 7) !== month.slice(0, 7)}
                    data-edge={edge}
                    aria-current={day === maxDate ? "date" : undefined}
                    aria-label={formatCalendarDate(day, { weekday: "long", month: "long", year: "numeric" })}
                    disabled={day > maxDate}
                    tabIndex={day === focused ? 0 : -1}
                    onFocus={() => setFocused(day)}
                    onKeyDown={(event) => onDayKey(event, day)}
                    onMouseEnter={() => { if (from && !to && day <= maxDate) setHovered(day); }}
                    onClick={() => selectDay(day)}
                  >{dateFromKey(day).getUTCDate()}</button>
                </div>
              );
            })}
          </div>
        ))}
      </div>

      <p id={hintId} className={styles.hint} aria-live="polite">
        {preset === "all" ? "Showing your full history." : preset === "custom" && !from ? "Choose a start date on the calendar."
          : from && !to ? "Now choose an end date. Tap the same day for one day."
          : "Dates are inclusive and follow Lagos time."}
      </p>
      <footer className={styles.actions}>
        <button type="button" onClick={onCancel}>Cancel</button>
        <button type="button" disabled={!complete} onClick={() => onApply(preset === "custom" ? { preset, from, to } : { preset })}>Apply filter <Check size={16} /></button>
      </footer>
    </div>
  );
}
