import { ClipboardCheck } from "lucide-react";
import { EmptyState } from "../../../components/Ui";

export default function DropOffChecklistPage() {
  return (
    <div className="screen-enter">
      <EmptyState icon={<ClipboardCheck size={30} />} title="Drop-off checklist">
        This is where you&apos;ll photograph your vehicle and check the dashboard when you return it. Coming soon.
      </EmptyState>
    </div>
  );
}
