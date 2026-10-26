/**
 * Turns parsed headers plus the IP lookups into the report: the route, the
 * sender's network, and plain-language findings. Pure, so it can be unit
 * tested without the API.
 */

import {
  authenticationOf,
  headerValues,
  hopsOf,
  originatingIp,
  parseMailbox,
  unfold,
  type Authentication,
  type Hop,
  type Mailbox,
} from "@/lib/parse";

/** What the IP lookup says about one address. */
export type Network = {
  ip: string;
  hostname: string | null;
  city: string;
  country: string;
  countryCode: string;
  asn: string;
  organization: string;
  asnType: string;
  connectionType: string;
  abuseEmail: string | null;
};

export type Kind = "home" | "mobile" | "hosting" | "business" | "education" | "government" | "isp" | "unknown";

export function kindOf(network: Network): Kind {
  const type = network.asnType.toUpperCase();
  const line = network.connectionType.toLowerCase();

  if (type === "HOSTING") {
    return "hosting";
  }

  if (/mobile|cellular/.test(line)) {
    return "mobile";
  }

  if (/cable|dsl|fib|broadband|satellite|fixed/.test(line)) {
    return "home";
  }

  const map: Record<string, Kind> = { BUSINESS: "business", EDUCATION: "education", GOVERNMENT: "government", ISP: "isp" };

  return map[type] ?? "unknown";
}

export type Severity = "bad" | "warn" | "info" | "good";

export type Finding = { severity: Severity; title: string; detail: string };

export type Report = {
  summary: {
    from: Mailbox;
    to: string | null;
    subject: string | null;
    date: string | null;
    messageId: string | null;
    replyTo: Mailbox;
    returnPath: Mailbox;
    mailer: string | null;
  };
  hops: Hop[];
  /** The first public address in the chain: the closest the headers get to the sender. */
  origin: { ip: string; source: "received" | "x-originating-ip"; step: number | null } | null;
  authentication: Authentication;
  findings: Finding[];
  /** Total seconds from the first hop's timestamp to the last's. */
  transitSeconds: number | null;
  headerCount: number;
};

/** IPs worth looking up: every public hop address, plus X-Originating-IP. */
export function addressesToLookUp(raw: string): string[] {
  const headers = unfold(raw);
  const ips = hopsOf(headers)
    .filter((hop) => hop.ip && !hop.internal)
    .map((hop) => hop.ip as string);
  const originating = originatingIp(headers);

  return [...new Set([...(originating ? [originating] : []), ...ips])];
}

export function analyze(raw: string, networks: Map<string, Network>): Report {
  const headers = unfold(raw);
  const hops = hopsOf(headers);
  const first = (name: string) => headerValues(headers, name)[0] ?? null;
  const from = parseMailbox(first("from") ?? undefined);
  const replyTo = parseMailbox(first("reply-to") ?? undefined);
  const returnPath = parseMailbox(first("return-path") ?? undefined);
  const authentication = authenticationOf(headers);
  const originating = originatingIp(headers);
  const firstPublic = hops.find((hop) => hop.ip && !hop.internal);
  const origin = originating
    ? { ip: originating, source: "x-originating-ip" as const, step: null }
    : firstPublic?.ip
      ? { ip: firstPublic.ip, source: "received" as const, step: firstPublic.step }
      : null;
  const timed = hops.filter((hop) => hop.time !== null);
  const transitSeconds =
    timed.length >= 2 ? Math.round(((timed[timed.length - 1].time as number) - (timed[0].time as number)) / 1000) : null;

  const findings: Finding[] = [
    ...authFindings(authentication, from),
    ...identityFindings(from, replyTo, returnPath, authentication),
    ...originFindings(origin, origin ? networks.get(origin.ip) : undefined),
    ...timingFindings(hops),
  ];

  if (hops.length === 0) {
    findings.unshift({
      severity: "warn",
      title: "No Received headers",
      detail:
        "Without them there is no route to trace. Copy the full original headers (“Show original” in Gmail, “View message source” in Outlook), not just From, To and Subject.",
    });
  }

  const order: Severity[] = ["bad", "warn", "info", "good"];
  findings.sort((a, b) => order.indexOf(a.severity) - order.indexOf(b.severity));

  return {
    summary: {
      from,
      to: first("to"),
      subject: first("subject"),
      date: first("date"),
      messageId: first("message-id"),
      replyTo,
      returnPath,
      mailer: first("x-mailer") ?? first("user-agent"),
    },
    hops,
    origin,
    authentication,
    findings,
    transitSeconds,
    headerCount: headers.length,
  };
}

function authFindings(auth: Authentication, from: Mailbox): Finding[] {
  const findings: Finding[] = [];

  if (!auth.authority && !auth.spf && auth.dkim.length === 0 && !auth.dmarc) {
    return [
      {
        severity: "info",
        title: "No authentication results",
        detail:
          "SPF, DKIM and DMARC verdicts are written by the receiving mail server. These headers have none, so they may have been copied before delivery, or the receiving server doesn't record them.",
      },
    ];
  }

  if (auth.dmarc) {
    if (auth.dmarc.result === "pass") {
      findings.push({
        severity: "good",
        title: "DMARC passed",
        detail: `The From domain${auth.dmarc.domain ? ` (${auth.dmarc.domain})` : ""} is backed by a matching SPF or DKIM check, so the sender is who the From line says, at domain level.`,
      });
    } else if (auth.dmarc.result === "fail") {
      findings.push({
        severity: "bad",
        title: "DMARC failed",
        detail: `Neither SPF nor DKIM vouches for the From domain${auth.dmarc.domain ? ` (${auth.dmarc.domain})` : ""}.${auth.dmarc.policy ? ` The domain's policy is “${auth.dmarc.policy}”.` : ""} This is the classic sign of a spoofed sender.`,
      });
    } else {
      findings.push({
        severity: "warn",
        title: `DMARC: ${auth.dmarc.result}`,
        detail: "The receiving server could not reach a DMARC verdict, so the From domain is unverified.",
      });
    }
  } else if (from.domain) {
    findings.push({
      severity: "warn",
      title: "No DMARC result",
      detail: `There is no DMARC verdict for ${from.domain}, so nothing ties the visible From address to the checks below.`,
    });
  }

  if (auth.spf) {
    const spf = auth.spf;
    const where = spf.domain ? ` for ${spf.domain}` : "";

    if (spf.result === "pass") {
      findings.push({ severity: "good", title: "SPF passed", detail: `The sending server is allowed to send mail${where}.` });
    } else if (spf.result === "fail") {
      findings.push({ severity: "bad", title: "SPF failed", detail: `The sending server is not on the list of servers allowed to send mail${where}.` });
    } else if (spf.result === "softfail") {
      findings.push({
        severity: "warn",
        title: "SPF soft fail",
        detail: `The domain${where ? where.replace(" for", "") : ""} says this server probably shouldn't be sending its mail, but asks receivers not to reject outright.`,
      });
    } else {
      findings.push({ severity: "warn", title: `SPF: ${spf.result}`, detail: `No usable SPF verdict${where}.` });
    }
  }

  const passing = auth.dkim.filter((item) => item.result === "pass");

  if (passing.length > 0) {
    const domains = [...new Set(passing.map((item) => item.domain).filter(Boolean))].join(", ");
    findings.push({ severity: "good", title: "DKIM signature valid", detail: `Signed by ${domains || "the sender"}, and not altered in transit.` });
  } else if (auth.dkim.some((item) => item.result === "fail" || item.result === "permerror")) {
    findings.push({ severity: "bad", title: "DKIM signature broken", detail: "The message was signed, but the signature doesn't verify: it was altered in transit, or forged." });
  } else if (auth.authority) {
    findings.push({ severity: "warn", title: "Not DKIM-signed", detail: "Nothing cryptographically links this message to the domain it claims to come from." });
  }

  return findings;
}

function identityFindings(from: Mailbox, replyTo: Mailbox, returnPath: Mailbox, auth: Authentication): Finding[] {
  const findings: Finding[] = [];
  const shownAddress = from.display ? /[^\s<>"]+@[^\s<>"]+\.[a-z]{2,}/i.exec(from.display)?.[0]?.toLowerCase() : undefined;

  if (shownAddress && from.address && shownAddress !== from.address) {
    findings.push({
      severity: "bad",
      title: "The display name shows a different address",
      detail: `It reads as “${shownAddress}” in most mail apps, but the message is really from ${from.address}.`,
    });
  }

  if (replyTo.domain && from.domain && replyTo.domain !== from.domain) {
    findings.push({
      severity: "warn",
      title: "Replies go to a different domain",
      detail: `It is from ${from.domain}, but answering it sends your reply to ${replyTo.address}. Phishing uses this to collect replies; newsletters and help desks also do it legitimately.`,
    });
  }

  if (returnPath.domain && from.domain && !sameOrganisation(returnPath.domain, from.domain)) {
    findings.push({
      severity: "info",
      title: "Bounces go to another domain",
      detail: `The envelope sender (Return-Path) is ${returnPath.domain}. That is normal when a mailing service sends on ${from.domain}'s behalf.`,
    });
  }

  const dkimDomains = auth.dkim.filter((item) => item.result === "pass" && item.domain).map((item) => item.domain as string);

  if (from.domain && dkimDomains.length > 0 && !dkimDomains.some((domain) => sameOrganisation(domain, from.domain as string)) && auth.dmarc?.result !== "pass") {
    findings.push({
      severity: "info",
      title: "Signed by a different domain",
      detail: `The valid DKIM signature belongs to ${dkimDomains.join(", ")}, not ${from.domain}.`,
    });
  }

  return findings;
}

function originFindings(origin: Report["origin"], network: Network | undefined): Finding[] {
  if (!origin) {
    return [];
  }

  const where = network ? [network.city, network.country].filter(Boolean).join(", ") : "";
  const who = network?.organization ? ` on ${network.organization}` : "";
  const via = origin.source === "x-originating-ip" ? " (from the X-Originating-IP header)" : "";
  const findings: Finding[] = [
    {
      severity: "info",
      title: `Sent from ${origin.ip}`,
      detail: `${where ? `${where}${who}` : `An address${who}`}${via}. This is the earliest public address in the headers, the closest they get to the sender.`,
    },
  ];

  if (network) {
    const kind = kindOf(network);

    if (kind === "home" || kind === "mobile") {
      findings.push({
        severity: "info",
        title: kind === "home" ? "Sent from a home connection" : "Sent from a mobile network",
        detail:
          "Normal for a person sending from a mail app. Unusual for a company's own mail, which normally leaves from a mail provider's servers.",
      });
    }
  }

  return findings;
}

function timingFindings(hops: Hop[]): Finding[] {
  const findings: Finding[] = [];

  for (const hop of hops) {
    if (hop.delay !== null && hop.delay < -60) {
      findings.push({
        severity: "warn",
        title: `Clock disagreement at hop ${hop.step}`,
        detail: `Hop ${hop.step} is stamped ${formatSeconds(-hop.delay)} before the hop that handed it the message. One of the two servers has the wrong time, or a header was edited.`,
      });
    } else if (hop.delay !== null && hop.delay > 600) {
      findings.push({
        severity: "info",
        title: `Slow hop: ${formatSeconds(hop.delay)}`,
        detail: `The message waited ${formatSeconds(hop.delay)} before ${hop.by ?? `hop ${hop.step}`} accepted it, which usually means a queue, a retry or greylisting.`,
      });
    }
  }

  return findings;
}

/**
 * mail.google.com and google.com belong together. Compares the registrable
 * part: the last two labels, or three under a two-letter country code with a
 * generic second level (bbc.co.uk is not the same as evil.co.uk).
 */
export function sameOrganisation(a: string, b: string): boolean {
  return registrable(a) === registrable(b);
}

function registrable(domain: string): string {
  const labels = domain.toLowerCase().replace(/\.$/, "").split(".");
  const generic = ["co", "com", "net", "org", "gov", "ac", "edu", "ne", "or", "go"];
  const take = labels.length >= 3 && labels[labels.length - 1].length === 2 && generic.includes(labels[labels.length - 2]) ? 3 : 2;

  return labels.slice(-take).join(".");
}

export function formatSeconds(seconds: number): string {
  const total = Math.abs(Math.round(seconds));

  if (total < 60) {
    return `${total} s`;
  }

  if (total < 3600) {
    const minutes = Math.floor(total / 60);
    const rest = total % 60;

    return rest ? `${minutes} min ${rest} s` : `${minutes} min`;
  }

  const hours = Math.floor(total / 3600);
  const minutes = Math.round((total % 3600) / 60);

  return minutes ? `${hours} h ${minutes} min` : `${hours} h`;
}
