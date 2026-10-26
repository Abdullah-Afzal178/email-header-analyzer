import { POWERED_BY_URL } from "@/lib/constants";

export function PoweredByBadge({ className }: { className?: string }) {
  return (
    <a
      href={POWERED_BY_URL}
      target="_blank"
      rel="noreferrer"
      className={[
        "inline-flex items-center gap-2 whitespace-nowrap rounded-full border border-rule bg-card px-3 py-1.5 text-xs font-semibold text-navy transition hover:border-airmail-blue hover:text-airmail-blue focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-airmail-blue/20",
        className ?? "",
      ].join(" ")}
    >
      <span className="inline-flex gap-0.5" aria-hidden="true">
        <span className="h-2 w-1 -skew-x-12 bg-airmail-red" />
        <span className="h-2 w-1 -skew-x-12 bg-airmail-blue" />
      </span>
      Powered by ipgeolocation.io
    </a>
  );
}
