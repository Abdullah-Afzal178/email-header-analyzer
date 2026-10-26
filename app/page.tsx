import { Analyzer } from "@/components/analyzer";
import { PoweredByBadge } from "@/components/powered-by-badge";
import { IP_API_URL, SITE_NAME } from "@/lib/constants";

const CLIENTS = [
  { name: "Gmail", steps: "Open the message, click the three dots next to Reply, choose Show original, then Copy to clipboard." },
  { name: "Outlook (web)", steps: "Open the message, click the three dots, then View, then View message source." },
  { name: "Outlook (Windows)", steps: "Open the message in its own window, choose File, then Properties. The headers are in Internet headers." },
  { name: "Apple Mail", steps: "Select the message, then View, then Message, then All Headers. Or press Shift+Command+H." },
  { name: "Yahoo Mail", steps: "Open the message, click the three dots, then View raw message." },
  { name: "Thunderbird", steps: "Open the message, then View, then Message Source. Or press Ctrl+U." },
];

const NOTES = [
  {
    question: "What do email headers show?",
    answer:
      "Every server that handles a message stamps a Received line on top, with the address of the machine that handed it over and the time. Read from the bottom up, they replay the message's route. The receiving server also writes its verdict on SPF, DKIM and DMARC.",
  },
  {
    question: "Can headers be faked?",
    answer:
      "The lower ones can. A sender can write anything into a message before sending it, including fake Received lines. The lines added by servers after it left the sender's hands, and the receiving server's Authentication-Results, are the trustworthy part. That's why this tool reads only the topmost Authentication-Results.",
  },
  {
    question: "What are SPF, DKIM and DMARC?",
    answer:
      "SPF checks that the sending server is allowed to send mail for the envelope domain. DKIM checks a cryptographic signature from the signing domain. DMARC ties them to the domain you actually see in From: it passes only when SPF or DKIM passes for that same domain. A DMARC failure on a known brand is the clearest sign of spoofing.",
  },
  {
    question: "Does this show the sender's real IP address?",
    answer:
      "Sometimes. Mail apps that connect straight to a mail server leave the sender's own address in the first Received line, often a home or mobile connection. Webmail (Gmail, Outlook.com) usually hides it, and the trail starts at the provider's servers instead. Some providers add an X-Originating-IP header with it.",
  },
  {
    question: "Why is there a delay between two hops?",
    answer:
      "A few seconds is normal. Minutes usually mean the message sat in a queue, was retried, or was greylisted (deliberately delayed to deter spammers). A hop stamped earlier than the one before it means one of the servers has its clock set wrong.",
  },
  {
    question: "Is it safe to paste headers here?",
    answer:
      "Headers carry names, addresses and subject lines, so they are posted to this site's server, never put in the page address, and nothing is stored or logged. Only the server IP addresses from the route are sent to ipgeolocation.io to be located.",
  },
];

export default function Home() {
  return (
    <div className="min-h-screen">
      <div className="airmail h-2.5" aria-hidden="true" />
      <header className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 pt-6 sm:px-6">
        <a href="/" className="flex items-center gap-2.5 rounded-lg focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-airmail-blue/20">
          <span className="grid h-8 w-11 place-items-center rounded-md border-2 border-navy bg-card" aria-hidden="true">
            <span className="h-3 w-5 border-b-2 border-l-2 border-navy" style={{ transform: "translateY(-3px) rotate(-45deg)" }} />
          </span>
          <span className="text-base font-bold tracking-tight">{SITE_NAME}</span>
        </a>
        <PoweredByBadge />
      </header>

      <main className="mx-auto max-w-6xl px-4 pb-16 pt-10 sm:px-6">
        <div className="max-w-3xl">
          <h1 className="text-4xl font-bold leading-[1.05] tracking-tight sm:text-5xl" style={{ fontStretch: "112%" }}>
            Where did this email really come from?
          </h1>
          <p className="mt-4 text-lg leading-relaxed text-navy/80">
            Paste a message&apos;s raw headers to trace every server it passed through, where each one is and who runs it,
            and whether SPF, DKIM and DMARC checked out.
          </p>
        </div>

        <div className="mt-10">
          <Analyzer intro={<Intro />} />
        </div>

        <section aria-labelledby="notes-heading" className="mt-16">
          <h2 id="notes-heading" className="text-2xl font-bold tracking-tight">
            Reading email headers
          </h2>
          <div className="mt-6 grid gap-x-10 gap-y-7 md:grid-cols-2">
            {NOTES.map((note) => (
              <div key={note.question}>
                <h3 className="font-semibold">{note.question}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-navy/80">{note.answer}</p>
              </div>
            ))}
          </div>
        </section>
      </main>

      <footer className="border-t border-rule bg-card">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-6 text-sm text-postmark sm:px-6">
          <p>
            Servers located with the{" "}
            <a href={IP_API_URL} target="_blank" rel="noreferrer" className="font-semibold text-airmail-blue underline decoration-airmail-blue/30 underline-offset-4 hover:decoration-airmail-blue">
              ipgeolocation.io IP Geolocation API
            </a>
            . Open source under the MIT licence.
          </p>
          <PoweredByBadge />
        </div>
        <div className="airmail h-2.5" aria-hidden="true" />
      </footer>
    </div>
  );
}

/** Shown in the report column until something is pasted: how to get the headers. */
function Intro() {
  return (
    <section aria-labelledby="how-heading" className="rounded-2xl border border-rule bg-card p-6">
      <h2 id="how-heading" className="text-xl font-bold">
        How to copy an email&apos;s headers
      </h2>
      <p className="mt-2 text-sm text-postmark">Copy all of them, not just From and Subject: the Received lines are the route.</p>
      <ol className="mt-5 space-y-4">
        {CLIENTS.map((client, index) => (
          <li key={client.name} className="flex gap-3">
            <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full border-2 border-dashed border-airmail-red font-mono text-xs text-airmail-red" aria-hidden="true">
              {index + 1}
            </span>
            <div>
              <h3 className="font-semibold">{client.name}</h3>
              <p className="mt-0.5 text-sm leading-relaxed text-navy/80">{client.steps}</p>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
