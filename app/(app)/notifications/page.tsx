import { BellRing } from "lucide-react";
import { EmptyState } from "../../components/Ui";

export default function NotificationsPage() {
  return (
    <div className="screen-enter">
      <EmptyState icon={<BellRing size={30} />} title="You're all caught up">
        New alerts about payments, charging and your vehicle will show up here.
      </EmptyState>
    </div>
  );
}
