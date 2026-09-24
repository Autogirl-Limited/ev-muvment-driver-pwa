import { ClipboardCheck } from "lucide-react";
import { EmptyState } from "../../../components/Ui";

export default function PickUpChecklistPage() {
  return (
    <div className="screen-enter">
      <EmptyState icon={<ClipboardCheck size={30} />} title="Pick-up checklist">
        This is where you&apos;ll photograph your vehicle and check the dashboard before you start your shift. Coming soon.
      </EmptyState>
    </div>
  );
}
