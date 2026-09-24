import { ChecklistFlow } from "../../../components/checklist/ChecklistFlow";

export default function PickUpChecklistPage() {
  return (
    <div className="screen-enter">
      <ChecklistFlow phase="PICK_UP" />
    </div>
  );
}
