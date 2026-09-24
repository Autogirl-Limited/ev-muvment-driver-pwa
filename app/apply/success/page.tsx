import Link from "next/link";
import { ArrowRight, Check, Clock, KeyRound } from "lucide-react";
import { ScreenBar } from "../../components/Ui";

export default function ApplicationSubmittedPage() {
  return (
    <div className="screen-enter">
      <ScreenBar />
      <section className="center-screen success">
        <div className="success-orb">
          <svg viewBox="0 0 24 24" width="40" height="40" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path className="draw" d="m5 12.5 4.5 4.5L19 7.5" />
          </svg>
        </div>
        <div className="screen-title">
          <h1>Application submitted</h1>
          <p>Thanks! We&apos;ll contact you by SMS or email after review. Once approved, sign in with the temporary password you receive.</p>
        </div>
        <div className="timeline">
          <div className="done"><span><Check size={14} strokeWidth={3} /></span> Application received</div>
          <div><span><Clock size={14} /></span> Under review</div>
          <div><span><KeyRound size={14} /></span> Temporary password sent</div>
        </div>
        <div className="form-actions">
          <Link className="primary-button" href="/login">
            Sign in <ArrowRight size={18} />
          </Link>
          <Link className="text-button" href="/apply">
            Submit another application
          </Link>
        </div>
      </section>
    </div>
  );
}
