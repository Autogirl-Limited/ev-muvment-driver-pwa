import { Gauge } from "lucide-react";
import type { ChecklistPhaseName, ImageType } from "../../lib/types";

export const SHOTS: Record<ImageType, { label: string; title: string; tip: string }> = {
  FRONT: { label: "Front", title: "Photograph the front", tip: "Stand a few steps back so the whole front, bumper and headlights fit in the frame." },
  REAR: { label: "Rear", title: "Photograph the rear", tip: "Step back so the whole back, bumper and tail lights are in the frame." },
  LEFT: { label: "Left side", title: "Photograph the left side", tip: "Stand level with the car and get both wheels and the full length of the side in view." },
  RIGHT: { label: "Right side", title: "Photograph the right side", tip: "Stand level with the car and get both wheels and the full length of the side in view." },
  DASHBOARD: { label: "Dashboard", title: "Photograph the dashboard", tip: "Switch the car on, then capture the whole instrument cluster. Make sure the odometer, battery and warning lights are readable." },
};

export const PHASE_COPY: Record<
  ChecklistPhaseName,
  { name: string; intro: string; submitLabel: string; doneTitle: string; doneSub: string }
> = {
  PICK_UP: {
    name: "Pick-up",
    intro: "Five quick photos to record the car's condition before you drive off. It takes about two minutes.",
    submitLabel: "Submit pick-up checklist",
    doneTitle: "Pick-up complete",
    doneSub: "You're on shift. Drive safe out there.",
  },
  DROP_OFF: {
    name: "Drop-off",
    intro: "Five quick photos to record the car's condition on return. We compare them with your pick-up photos.",
    submitLabel: "Submit drop-off checklist",
    doneTitle: "Drop-off complete",
    doneSub: "Your shift has ended. Thanks for a good day.",
  },
};

/** Top-down car with the side to photograph lit up. */
export function CarGuide({ side }: { side: ImageType }) {
  if (side === "DASHBOARD") return <Gauge className="cl-guide-gauge" size={64} strokeWidth={1.4} />;
  const on = (s: ImageType) => (side === s ? "hl on" : "hl");
  return (
    <svg className="cl-guide" viewBox="0 0 120 160" aria-hidden="true">
      <rect className="car-body" x="32" y="18" width="56" height="124" rx="24" />
      <rect className="car-glass" x="39" y="50" width="42" height="20" rx="6" />
      <rect className="car-glass" x="39" y="102" width="42" height="14" rx="5" />
      <rect className="car-wheel" x="26" y="36" width="7" height="20" rx="3" />
      <rect className="car-wheel" x="87" y="36" width="7" height="20" rx="3" />
      <rect className="car-wheel" x="26" y="104" width="7" height="20" rx="3" />
      <rect className="car-wheel" x="87" y="104" width="7" height="20" rx="3" />
      <path className={on("FRONT")} d="M40 12 Q60 4 80 12" />
      <path className={on("REAR")} d="M40 148 Q60 156 80 148" />
      <path className={on("LEFT")} d="M18 40 V120" />
      <path className={on("RIGHT")} d="M102 40 V120" />
    </svg>
  );
}
