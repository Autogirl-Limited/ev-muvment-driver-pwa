import { ChecklistHistory } from "../../components/checklist/ChecklistHistory";
import { TodayBoard } from "../../components/checklist/TodayBoard";

export default function ChecklistPage() {
  return (
    <div className="screen-enter cl-hub">
      <TodayBoard />
      <ChecklistHistory />
    </div>
  );
}
