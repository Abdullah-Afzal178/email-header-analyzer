"use client";

import { ArrowDown, CircleAlert, CircleCheck, Info, Loader2, ShieldAlert, Trash2 } from "lucide-react";
import { useRef, useState, type ReactNode } from "react";

import { formatSeconds, kindOf, sameOrganisation, type Finding, type Network, type Report, type Severity } from "@/lib/analyze";
import type { Hop } from "@/lib/parse";
import { NORMAL_SAMPLE, SUSPICIOUS_SAMPLE } from "@/lib/samples";

type Response = { report: Report; networks: Record<string, Network>; lookupProblem: string | null };

/**
 * The paste box (a sticky rail on the right) and the report (the left
 * column). Headers are posted to this site's own endpoint, never put in the
 * URL, because they carry names and addresses.
 */
export function Analyzer({ intro }: { intro: ReactNode }) {
  const [text, setText] = useState("");
  const [state, setState] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [result, setResult] = useState<Response | null>(null);
  const [error, setError] = useState<string | null>(null);
  const reportRef = useRef<HTMLDivElement>(null);

  async function run(headers: string) {
    setState("loading");
    setError(null);

    try {
      const response = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ headers }),
      });
      const payload = (await response.json()) as Response | { error: string };

      if (!response.ok || "error" in payload) {
        setError("error" in payload ? payload.error : `The analysis failed with status ${response.status}.`);
        setState("error");
        return;
      }

      setResult(payload);
      setState("done");
      // On phones the report sits below the box; bring it into view.
      if (window.matchMedia("(max-width: 1023px)").matches) {
        window.requestAnimationFrame(() => reportRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
      }
    } catch {
      setError("The analysis couldn't be reached. Check your connection and try again.");
      setState("error");
    }
  }

  function loadSample(sample: string) {
    setText(sample);
    void run(sample);
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_25rem]">
      <aside className="lg:sticky lg:top-6 lg:col-start-2 lg:row-start-1 lg:self-start" aria-label="Paste headers">
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void run(text);
          }}
          className="rounded-2xl border border-rule bg-card p-5 shadow-[0_18px_40px_-28px_rgba(27,42,74,0.45)]"
        >
          <label htmlFor="headers" className="text-sm font-semibold uppercase tracking-[0.14em]">
            Raw email headers
          </label>
          <textarea
            id="headers"
            value={text}
            onChange={(event) => setText(event.target.value)}
            rows={14}
            spellCheck={false}
            placeholder={"Received: from mail.example.com ...\nAuthentication-Results: ...\nFrom: ...\nSubject: ..."}
            className="mt-2 block w-full resize-y rounded-xl border border-rule bg-envelope/60 px-3 py-2.5 font-mono text-xs leading-relaxed outline-hidden placeholder:text-postmark/60 focus-visible:border-airmail-blue focus-visible:ring-4 focus-visible:ring-airmail-blue/15"
          />
          <div className="mt-3 flex gap-2">
            <button
              type="submit"
              disabled={state === "loading" || text.trim() === ""}
              className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-navy px-4 py-2.5 font-semibold text-envelope transition hover:bg-airmail-blue focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-airmail-blue/30 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {state === "loading" ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
              {state === "loading" ? "Tracing" : "Trace this email"}
            </button>
            {text ? (
              <button
                type="button"
                onClick={() => {
                  setText("");
                  setResult(null);
                  setState("idle");
                  setError(null);
                }}
                className="inline-flex items-center gap-1.5 rounded-xl border border-rule px-3 text-sm text-postmark transition hover:border-airmail-red hover:text-airmail-red focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-airmail-red/20"
              >
                <Trash2 className="h-4 w-4" aria-hidden="true" />
                Clear
              </button>
            ) : null}
          </div>
          <div className="mt-4 border-t border-rule pt-3 text-sm">
            <p className="text-postmark">Or try a sample:</p>
            <div className="mt-2 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => loadSample(SUSPICIOUS_SAMPLE)}
                className="rounded-full border border-airmail-red/40 px-3 py-1 font-medium text-airmail-red transition hover:bg-airmail-red hover:text-white focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-airmail-red/20"
              >
                A phishing attempt
              </button>
              <button
                type="button"
                onClick={() => loadSample(NORMAL_SAMPLE)}
                className="rounded-full border border-airmail-blue/40 px-3 py-1 font-medium text-airmail-blue transition hover:bg-airmail-blue hover:text-white focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-airmail-blue/20"
              >
                An ordinary Gmail message
              </button>
            </div>
          </div>
          <p className="mt-4 text-xs leading-relaxed text-postmark">
            Headers are read on this server and not stored. Only the server addresses in the route are sent to
            ipgeolocation.io to be located.
          </p>
          <noscript>
            <p className="mt-3 text-sm font-semibold text-airmail-red">This tool needs JavaScript to send the headers for analysis.</p>
          </noscript>
        </form>
      </aside>

      <div ref={reportRef} className="min-w-0 scroll-mt-6 lg:col-start-1 lg:row-start-1" aria-live="polite">
        {state === "error" && error ? (
          <div className="mb-6 flex gap-3 rounded-2xl border border-airmail-red/40 bg-card p-5">
            <CircleAlert className="mt-0.5 h-5 w-5 shrink-0 text-airmail-red" aria-hidden="true" />
            <p>{error}</p>
          </div>
        ) : null}
        {result ? <ReportView result={result} /> : intro}
      </div>
    </div>
  );
}

const SEVERITY_STYLE: Record<Severity, { border: string; icon: typeof Info; tone: string; label: string }> = {
  bad: { border: "border-l-airmail-red", icon: ShieldAlert, tone: "text-airmail-red", label: "Red flag" },
  warn: { border: "border-l-caution", icon: CircleAlert, tone: "text-caution", label: "Worth a look" },
  info: { border: "border-l-airmail-blue", icon: Info, tone: "text-airmail-blue", label: "Note" },
  good: { border: "border-l-pass", icon: CircleCheck, tone: "text-pass", label: "Checks out" },
};

function ReportView({ result }: { result: Response }) {
  const { report, networks, lookupProblem } = result;
  const counts = { bad: 0, warn: 0, info: 0, good: 0 };

  for (const finding of report.findings) {
    counts[finding.severity] += 1;
  }

  const verdict =
    counts.bad > 0
      ? { text: `${counts.bad} red ${counts.bad === 1 ? "flag" : "flags"}`, tone: "bg-airmail-red text-white" }
      : counts.warn > 0
        ? { text: `${counts.warn} ${counts.warn === 1 ? "thing" : "things"} worth a look`, tone: "bg-caution text-white" }
        : { text: "Nothing suspicious", tone: "bg-pass text-white" };

  return (
    <article aria-labelledby="report-heading" className="space-y-8">
      <header className="rounded-2xl border border-rule bg-card p-6">
        <p className={`inline-flex rounded-full px-3 py-1 text-sm font-semibold ${verdict.tone}`}>{verdict.text}</p>
        <h2 id="report-heading" className="mt-3 text-2xl font-bold leading-snug sm:text-3xl">
          {report.summary.subject || "(no subject)"}
        </h2>
        <dl className="mt-4 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-[6rem_minmax(0,1fr)]">
          <Fact term="From">
            {report.summary.from.display ? `${report.summary.from.display} ` : ""}
            {report.summary.from.address ? <span className="font-mono">&lt;{report.summary.from.address}&gt;</span> : "Not given"}
          </Fact>
          {report.summary.replyTo.address ? (
            <Fact term="Reply-To">
              <span className="font-mono">{report.summary.replyTo.address}</span>
            </Fact>
          ) : null}
          <Fact term="To">{report.summary.to ?? "Not given"}</Fact>
          <Fact term="Date">{report.summary.date ?? "Not given"}</Fact>
          {report.summary.mailer ? <Fact term="Sent with">{report.summary.mailer}</Fact> : null}
          {report.transitSeconds !== null ? <Fact term="In transit">{formatSeconds(report.transitSeconds)} over {report.hops.length} hops</Fact> : null}
        </dl>
      </header>

      {lookupProblem ? (
        <p className="rounded-2xl border border-caution/40 bg-card px-5 py-3 text-sm">{lookupProblem}</p>
      ) : null}

      <section aria-labelledby="findings-heading">
        <h3 id="findings-heading" className="text-sm font-semibold uppercase tracking-[0.14em] text-postmark">
          What the headers say
        </h3>
        <ul className="mt-3 space-y-2">
          {report.findings.map((finding) => (
            <FindingRow key={`${finding.severity}-${finding.title}`} finding={finding} />
          ))}
        </ul>
      </section>

      <section aria-labelledby="route-heading">
        <h3 id="route-heading" className="text-sm font-semibold uppercase tracking-[0.14em] text-postmark">
          The route, from sender to you
        </h3>
        {report.hops.length === 0 ? (
          <p className="mt-3 text-sm text-postmark">No Received headers to trace.</p>
        ) : (
          <ol className="relative mt-4 space-y-4 before:absolute before:bottom-6 before:left-[2.2rem] before:top-6 before:border-l-2 before:border-dashed before:border-rule">
            {report.hops.map((hop) => (
              <HopCard
                key={hop.step}
                hop={hop}
                network={hop.ip ? networks[hop.ip] : undefined}
                origin={report.origin?.step === hop.step}
                last={hop.step === report.hops.length}
              />
            ))}
          </ol>
        )}
        {report.origin?.source === "x-originating-ip" ? (
          <p className="mt-4 text-sm text-postmark">
            The X-Originating-IP header names the sender&apos;s own address,{" "}
            <span className="font-mono">{report.origin.ip}</span>
            {networks[report.origin.ip] ? `, in ${[networks[report.origin.ip].city, networks[report.origin.ip].country].filter(Boolean).join(", ")}` : ""}.
          </p>
        ) : null}
      </section>
    </article>
  );
}

function Fact({ term, children }: { term: string; children: ReactNode }) {
  return (
    <>
      <dt className="text-postmark">{term}</dt>
      <dd className="min-w-0 break-words">{children}</dd>
    </>
  );
}

function FindingRow({ finding }: { finding: Finding }) {
  const style = SEVERITY_STYLE[finding.severity];
  const Icon = style.icon;

  return (
    <li className={`flex gap-3 rounded-xl border border-rule border-l-4 bg-card px-4 py-3 ${style.border}`}>
      <Icon className={`mt-0.5 h-5 w-5 shrink-0 ${style.tone}`} aria-hidden="true" />
      <div>
        <p className="font-semibold">
          <span className="sr-only">{style.label}: </span>
          {finding.title}
        </p>
        <p className="mt-0.5 text-sm leading-relaxed text-navy/80">{finding.detail}</p>
      </div>
    </li>
  );
}

const KIND_LABEL: Record<ReturnType<typeof kindOf>, string> = {
  home: "Home broadband",
  mobile: "Mobile network",
  hosting: "Hosting or cloud",
  business: "Business network",
  education: "Education network",
  government: "Government network",
  isp: "Internet provider",
  unknown: "Network type unknown",
};

function HopCard({ hop, network, origin, last }: { hop: Hop; network: Network | undefined; origin: boolean; last: boolean }) {
  const place = network ? [network.city, network.country].filter(Boolean).join(", ") : "";
  // A name the machine announced that doesn't belong with its reverse DNS name.
  const heloMismatch = Boolean(hop.helo && network?.hostname && /[a-z]/i.test(hop.helo) && !sameOrganisation(hop.helo, network.hostname));

  return (
    <li className="relative flex gap-4">
      <Postmark step={hop.step} code={network?.countryCode || (hop.internal ? "LAN" : hop.ip ? "?" : "")} internal={hop.internal || !hop.ip} />
      <div className={`min-w-0 flex-1 rounded-2xl border bg-card p-4 ${origin ? "border-airmail-red/50" : "border-rule"}`}>
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <p className="font-semibold">
            {origin ? <span className="mr-2 rounded-full bg-airmail-red px-2 py-0.5 text-xs font-semibold text-white">Origin</span> : null}
            {last ? <span className="mr-2 rounded-full bg-airmail-blue px-2 py-0.5 text-xs font-semibold text-white">Your mail server</span> : null}
            {hop.by ? (
              <>
                Received by <span className="break-all font-mono text-sm font-normal">{hop.by}</span>
              </>
            ) : (
              "Received"
            )}
          </p>
          {hop.delay !== null ? (
            <p className={`font-mono text-xs ${hop.delay < -60 ? "text-airmail-red" : "text-postmark"}`}>
              {hop.delay < 0 ? "−" : "+"}
              {formatSeconds(hop.delay)}
            </p>
          ) : null}
        </div>

        <dl className="mt-3 grid gap-x-4 gap-y-1.5 text-sm sm:grid-cols-[8rem_minmax(0,1fr)]">
          <dt className="text-postmark">From address</dt>
          <dd className="font-mono">
            {hop.ip ?? <span className="font-sans text-postmark">Not recorded</span>}
            {hop.internal ? <span className="ml-2 font-sans text-xs text-postmark">(private, inside one network)</span> : null}
          </dd>
          {hop.helo ? (
            <>
              <dt className="text-postmark">Announced as</dt>
              <dd className="break-all font-mono">{hop.helo}</dd>
            </>
          ) : null}
          {network?.hostname ? (
            <>
              <dt className="text-postmark">Reverse DNS</dt>
              <dd className="break-all font-mono">
                {network.hostname}
                {heloMismatch ? <span className="ml-2 font-sans text-xs text-caution">(differs from the announced name)</span> : null}
              </dd>
            </>
          ) : null}
          {network ? (
            <>
              <dt className="text-postmark">Network</dt>
              <dd>
                {network.organization || "Unknown"}
                {network.asn ? <span className="ml-1.5 font-mono text-xs text-postmark">{network.asn}</span> : null}
                <span className="ml-2 rounded-full bg-envelope px-2 py-0.5 text-xs">{KIND_LABEL[kindOf(network)]}</span>
              </dd>
              {place ? (
                <>
                  <dt className="text-postmark">Location</dt>
                  <dd>{place}</dd>
                </>
              ) : null}
              {origin && network.abuseEmail ? (
                <>
                  <dt className="text-postmark">Report abuse to</dt>
                  <dd>
                    <a href={`mailto:${network.abuseEmail}`} className="font-mono text-airmail-blue underline decoration-airmail-blue/30 underline-offset-4 hover:decoration-airmail-blue">
                      {network.abuseEmail}
                    </a>
                  </dd>
                </>
              ) : null}
            </>
          ) : null}
          {hop.protocol ? (
            <>
              <dt className="text-postmark">Protocol</dt>
              <dd className="font-mono">{hop.protocol}</dd>
            </>
          ) : null}
          {hop.time !== null ? (
            <>
              <dt className="text-postmark">Stamped</dt>
              <dd className="font-mono">{new Date(hop.time).toISOString().replace(".000Z", "Z")}</dd>
            </>
          ) : null}
        </dl>

        <details className="mt-3 text-xs">
          <summary className="cursor-pointer text-postmark hover:text-navy">Raw header</summary>
          <pre className="mt-2 whitespace-pre-wrap break-all rounded-lg bg-envelope p-2.5 font-mono leading-relaxed">Received: {hop.raw}</pre>
        </details>
      </div>
      {!last ? <ArrowDown className="absolute -bottom-4 left-[1.85rem] h-4 w-4 text-postmark/50" aria-hidden="true" /> : null}
    </li>
  );
}

/** A round postmark with the hop number and the country it was in. */
function Postmark({ step, code, internal }: { step: number; code: string; internal: boolean }) {
  return (
    <div
      className={`relative z-10 grid h-[4.5rem] w-[4.5rem] shrink-0 place-items-center rounded-full border-2 border-dashed bg-card text-center ${
        internal ? "border-postmark/40 text-postmark/70" : "border-airmail-red text-airmail-red"
      }`}
      aria-hidden="true"
    >
      <div className="leading-none">
        <p className="text-[10px] font-semibold uppercase tracking-[0.18em]">Hop {step}</p>
        <p className="mt-1 font-mono text-lg font-medium">{code || "·"}</p>
      </div>
    </div>
  );
}

