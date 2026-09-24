import { ClipboardCheck } from "lucide-react";
import { EmptyState } from "../../components/Ui";

export default function ChecklistPage() {
  return (
    <div className="screen-enter">
      <EmptyState icon={<ClipboardCheck size={30} />} title="Checklist is coming soon">
        Your daily vehicle checks will live here, so nothing gets missed before you hit the road.
      </EmptyState>
    </div>
  );
}
