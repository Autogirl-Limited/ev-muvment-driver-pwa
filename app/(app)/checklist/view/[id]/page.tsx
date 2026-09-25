"use client";

import { useParams } from "next/navigation";
import Link from "next/link";
import { CircleAlert } from "lucide-react";
import { ChecklistResult } from "../../../../components/checklist/ChecklistResult";
import { useChecklistById } from "../../../../lib/queries";

export default function ChecklistDetailPage() {
  const { id } = useParams<{ id: string }>();
  const query = useChecklistById(id);
  const checklist = query.data;

  return (
    <div className="screen-enter">
      {query.isPending ? (
        <div className="cl-card cl-skeleton" aria-busy="true" aria-label="Loading checklist" />
      ) : !checklist ? (
        <div className="cl-card cl-intro">
          <CircleAlert size={30} />
          <h2>Couldn&apos;t open this checklist</h2>
          <p>{query.error?.message ?? "It may have been removed."}</p>
          <Link className="ghost-button" href="/checklist">
            Back to checklists
          </Link>
        </div>
      ) : checklist.status !== "SUBMITTED" ? (
        <div className="cl-card cl-intro">
          <CircleAlert size={30} />
          <h2>Not submitted</h2>
          <p>This checklist was started but never submitted, so there are no results to show.</p>
          <Link className="ghost-button" href="/checklist">
            Back to checklists
          </Link>
        </div>
      ) : (
        <ChecklistResult checklist={checklist} history phase={checklist.phase} />
      )}
    </div>
  );
}
