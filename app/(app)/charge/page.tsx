import { BatteryCharging } from "lucide-react";
import { EmptyState } from "../../components/Ui";

export default function ChargePage() {
  return (
    <div className="screen-enter">
      <EmptyState icon={<BatteryCharging size={30} />} title="Charging is coming soon">
        Find charging stations, start a session and track your charging history right here.
      </EmptyState>
    </div>
  );
}
