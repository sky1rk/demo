import type { ReactNode } from "react";

import MsIcon from "./MsIcon.tsx";

/**
 * "Check your inbox" confirmation screen shared by signup and the
 * forgot-password flow. Presentational only; resend logic lives in the page.
 */
export default function CheckInbox({
  email,
  title,
  description,
  children,
}: {
  email: string;
  title: string;
  description: ReactNode;
  /** Optional resend area or extra actions rendered below the copy. */
  children?: ReactNode;
}) {
  return (
    <div className="mx-auto max-w-90 py-8 text-center">
      <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-theme-cream">
        <MsIcon name="mark_email_read" className="text-[28px] text-theme-maroon" optical={28} />
      </div>

      <h1 className="text-2xl font-bold">{title}</h1>
      <p className="mt-2 text-sm text-theme-gray">{description}</p>

      <div className="mt-3 inline-block rounded-lg border border-theme-line bg-theme-light-gray px-4 py-2 text-sm font-medium text-theme-ink">
        {email}
      </div>

      <div className="mt-5 flex flex-col gap-3">{children}</div>
    </div>
  );
}
