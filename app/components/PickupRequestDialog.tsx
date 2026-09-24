"use client";

import { useId, useState } from "react";
import { CalendarClock } from "lucide-react";
import { toast } from "sonner";
import { ApiError } from "../lib/api";
import { useCreatePickupRequest } from "../lib/queries";
import { Modal } from "./Modal";
import { TextField } from "./FormControls";
import { Spinner } from "./Ui";

const toHHMM = (minutes: number) => `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;

/** Sensible defaults: the next 5 minutes in Nigeria time, for an hour. */
function defaultTimes(now: number) {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Lagos", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(new Date(now));
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0) % 24;
  const start = Math.min(Math.ceil((get("hour") * 60 + get("minute") + 1) / 5) * 5, 23 * 60 + 58);
  return { start: toHHMM(start), end: toHHMM(Math.min(start + 60, 23 * 60 + 59)) };
}

function Form({ now, onClose, onSent }: { now: number; onClose: () => void; onSent: () => void }) {
  const mutation = useCreatePickupRequest();
  const reasonId = useId();
  const [times] = useState(() => defaultTimes(now));
  const [start, setStart] = useState(times.start);
  const [end, setEnd] = useState(times.end);
  const [reason, setReason] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});

  const submit = () => {
    const next: Record<string, string> = {};
    if (!start) next.requested_start_time = "Choose a start time.";
    if (!end) next.requested_end_time = "Choose an end time.";
    else if (start && end <= start) next.requested_end_time = "End time must be after the start time.";
    if (!reason.trim()) next.reason = "Tell us why you need a different time.";
    setErrors(next);
    if (Object.keys(next).length) return;

    mutation.mutate(
      { requested_start_time: start, requested_end_time: end, reason: reason.trim() },
      {
        onSuccess: () => {
          toast.success("Request sent. Admin has been notified.");
          onSent();
          onClose();
        },
        onError: (error) => {
          if (error instanceof ApiError && Object.keys(error.fieldErrors).length) setErrors(error.fieldErrors);
          else toast.error(error.message);
        },
      },
    );
  };

  return (
    <form
      className="request-form"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <span className="confirm-icon">
        <CalendarClock size={26} />
      </span>
      <h2>Request a pick-up time</h2>
      <p>Pick the window you can make today. Once admin approves it, your pick-up checklist opens for that time.</p>

      <div className="request-times">
        <TextField error={errors.requested_start_time} label="From" type="time" value={start} onChange={(e) => setStart(e.target.value)} />
        <TextField error={errors.requested_end_time} label="Until" type="time" value={end} onChange={(e) => setEnd(e.target.value)} />
      </div>

      <div className={`field ${errors.reason ? "field-error" : ""}`}>
        <div className="field-top">
          <label htmlFor={reasonId}>Reason</label>
        </div>
        <div className="field-shell">
          <textarea
            id={reasonId}
            maxLength={500}
            placeholder="e.g. Stuck in traffic on the mainland bridge"
            rows={3}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </div>
        {errors.reason ? (
          <span className="field-message" role="alert">
            {errors.reason}
          </span>
        ) : null}
      </div>

      <div className="confirm-actions">
        <button className="primary-button" disabled={mutation.isPending} type="submit">
          {mutation.isPending ? <Spinner /> : null} Send request
        </button>
        <button className="ghost-button" disabled={mutation.isPending} type="button" onClick={onClose}>
          Cancel
        </button>
      </div>
    </form>
  );
}

export function PickupRequestDialog({ open, onClose, now, onSent }: { open: boolean; onClose: () => void; now: number; onSent: () => void }) {
  return (
    <Modal label="Request a pick-up time" open={open} onClose={onClose}>
      <Form now={now} onClose={onClose} onSent={onSent} />
    </Modal>
  );
}
