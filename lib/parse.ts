/**
 * Reads raw email headers: the Received chain, authentication results and
 * the identity headers. Pure, so it can be unit tested on real header
 * samples.
 *
 * Every server that handles a message adds a Received header at the top, so
 * reading them bottom-up replays the message's journey from the sender. Each
 * one is written by the receiving server ("by"), describing the machine that
 * connected to it ("from"). Only the topmost few are trustworthy: anything
 * below the first server you control could have been forged by the sender.
 */

import { canonicalIp, isIp, isNonPublicIp } from "@/lib/ip";

export const MAX_INPUT = 64 * 1024;
export const MAX_HOPS = 40;

export type Header = { name: string; value: string };

/**
 * Splits a header block into fields, joining folded lines (a line starting
 * with whitespace continues the field above). Stops at the first blank line
 * after the headers, so a pasted message body is ignored.
 */
export function unfold(raw: string): Header[] {
  const lines = raw.replace(/\r\n?/g, "\n").split("\n");
  const headers: Header[] = [];
  let started = false;

  for (const line of lines) {
    if (line.trim() === "") {
      if (started) {
        break;
      }

      continue;
    }

    if (/^[ \t]/.test(line) && headers.length > 0) {
      headers[headers.length - 1].value += ` ${line.trim()}`;
      continue;
    }

    const match = /^([!-9;-~]+):\s?(.*)$/.exec(line);

    if (match) {
      started = true;
      headers.push({ name: match[1], value: match[2].trim() });
    }
  }

  return headers;
}

export function headerValues(headers: Header[], name: string): string[] {
  const wanted = name.toLowerCase();

  return headers.filter((header) => header.name.toLowerCase() === wanted).map((header) => header.value);
}

export type Hop = {
  /** 1 is the first hop: the server that took the message from the sender. */
  step: number;
  raw: string;
  /** The name the connecting machine announced (HELO/EHLO). */
  helo: string | null;
  /** The reverse DNS name the receiving server looked up, when it recorded one. */
  reverseName: string | null;
  /** The connecting machine's address, as the receiving server saw it. */
  ip: string | null;
  /** The server that wrote this header. */
  by: string | null;
  protocol: string | null;
  /** Milliseconds since the epoch, from the date after the semicolon. */
  time: number | null;
  /** Seconds since the previous hop. Negative means one of the two clocks is wrong. */
  delay: number | null;
  /** Private, loopback and similar addresses: hops inside one organisation. */
  internal: boolean;
};

/**
 * One Received header. The format is loose in practice, so this reads it
 * as clauses ("from ...", "by ...", "with ...") outside parentheses, then
 * digs the address out of the "from" clause's comment.
 */
export function parseReceived(value: string): Omit<Hop, "step" | "delay"> {
  const semicolon = value.lastIndexOf(";");
  const body = semicolon === -1 ? value : value.slice(0, semicolon);
  const dateText = semicolon === -1 ? "" : value.slice(semicolon + 1).trim();
  const clauses = splitClauses(body);
  const from = clauses.from ?? "";
  const heloMatch = /^\s*(\S+)/.exec(from.replace(/\(.*$/s, ""));
  const heloRaw = heloMatch ? heloMatch[1] : null;
  const ip = addressIn(from);
  const reverseName = reverseNameIn(from, ip);
  const byMatch = /^\s*(\S+)/.exec(clauses.by ?? "");
  const protocolMatch = /^\s*(\S+)/.exec(clauses.with ?? "");

  return {
    raw: value,
    helo: heloRaw ? heloRaw.replace(/^\[|\]$/g, "").replace(/\.$/, "") : null,
    reverseName,
    ip,
    by: byMatch ? byMatch[1].replace(/\.$/, "") : null,
    protocol: protocolMatch ? protocolMatch[1] : null,
    time: parseDate(dateText),
    internal: ip !== null && isInternal(ip),
  };
}

const KEYWORDS = ["from", "by", "via", "with", "id", "for"] as const;
type Keyword = (typeof KEYWORDS)[number];

/** The clauses of a Received header, split only at keywords outside (...) and [...]. */
function splitClauses(text: string): Partial<Record<Keyword, string>> {
  const clauses: Partial<Record<Keyword, string>> = {};
  let depth = 0;
  let current: Keyword | null = null;
  let buffer = "";

  const flush = () => {
    if (current && clauses[current] === undefined) {
      clauses[current] = buffer.trim();
    }

    buffer = "";
  };

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];

    if (char === "(" || char === "[") {
      depth += 1;
    } else if ((char === ")" || char === "]") && depth > 0) {
      depth -= 1;
    }

    if (depth === 0 && (index === 0 || /\s/.test(text[index - 1]))) {
      const keyword = KEYWORDS.find((word) => text.slice(index, index + word.length + 1).toLowerCase() === `${word} ` || text.slice(index, index + word.length + 1).toLowerCase() === `${word}\t`);

      if (keyword) {
        flush();
        current = keyword;
        index += keyword.length;
        continue;
      }
    }

    buffer += char;
  }

  flush();

  return clauses;
}

/**
 * The connecting address in a "from" clause. Servers write it as
 * "[203.0.113.5]", "[IPv6:2001:db8::1]", or (Exchange) a bare address in
 * the comment. The bracketed form inside the comment is what the server
 * observed; the announced HELO name is only used if it is itself an address.
 */
function addressIn(from: string): string | null {
  const comment = /\((.*)\)/s.exec(from)?.[1] ?? "";
  const candidates: string[] = [];

  for (const match of comment.matchAll(/\[(?:IPv6:)?([0-9a-fA-F:.]+)\]/g)) {
    candidates.push(match[1]);
  }

  for (const token of comment.split(/[\s()[\],;]+/)) {
    candidates.push(token.replace(/^IPv6:/i, ""));
  }

  for (const match of from.matchAll(/\[(?:IPv6:)?([0-9a-fA-F:.]+)\]/g)) {
    candidates.push(match[1]);
  }

  for (const candidate of candidates) {
    const ip = canonicalIp(candidate);

    if (ip && isIp(ip)) {
      return ip;
    }
  }

  return null;
}

/** "(mail.example.net. [203.0.113.5])": the name next to the address, unless it says unknown. */
function reverseNameIn(from: string, ip: string | null): string | null {
  const comment = /\((.*)\)/s.exec(from)?.[1] ?? "";
  const name = /^\s*([a-z0-9][a-z0-9.-]*\.[a-z]{2,}\.?)(?=\s|\[|$)/i.exec(comment)?.[1];

  if (!name || /^unknown$/i.test(name) || (ip && name.replace(/\.$/, "") === ip)) {
    return null;
  }

  return name.replace(/\.$/, "").toLowerCase();
}

function isInternal(ip: string): boolean {
  return isNonPublicIp(ip);
}

/** RFC 2822 dates, with the "(PDT)" style comment removed. Null when unreadable. */
export function parseDate(text: string): number | null {
  const cleaned = text.replace(/\([^)]*\)/g, "").replace(/\s+/g, " ").trim();

  if (!cleaned) {
    return null;
  }

  const ms = Date.parse(cleaned);

  return Number.isFinite(ms) ? ms : null;
}

/** The Received chain in the order the message travelled, first hop first, with delays. */
export function hopsOf(headers: Header[]): Hop[] {
  const received = headerValues(headers, "received").slice(0, MAX_HOPS).reverse();
  const hops: Hop[] = [];

  received.forEach((value, index) => {
    const parsed = parseReceived(value);
    const previous = hops[index - 1];
    const delay = previous && previous.time !== null && parsed.time !== null ? Math.round((parsed.time - previous.time) / 1000) : null;

    hops.push({ ...parsed, step: index + 1, delay });
  });

  return hops;
}

// --- identity and authentication -----------------------------------------------------

export type Mailbox = { display: string | null; address: string | null; domain: string | null };

/** "PayPal <service@paypal.com>" or a bare address. */
export function parseMailbox(value: string | undefined): Mailbox {
  if (!value) {
    return { display: null, address: null, domain: null };
  }

  const angle = /<([^<>@\s]+@[^<>\s]+)>/.exec(value);
  const bare = /([^\s<>"(),;:]+@[^\s<>"(),;:]+)/.exec(value);
  const address = (angle?.[1] ?? bare?.[1] ?? null)?.toLowerCase() ?? null;
  const displayRaw = angle ? value.slice(0, angle.index).trim() : "";
  const display = displayRaw.replace(/^"(.*)"$/s, "$1").trim() || null;

  return { display, address, domain: address ? address.split("@")[1].replace(/\.$/, "") : null };
}

export type AuthResult = "pass" | "fail" | "softfail" | "neutral" | "none" | "temperror" | "permerror" | "policy" | "bestguesspass";

export type Authentication = {
  spf: { result: AuthResult; domain: string | null } | null;
  dkim: { result: AuthResult; domain: string | null }[];
  dmarc: { result: AuthResult; policy: string | null; domain: string | null } | null;
  /** The server that wrote the results we trust: the topmost Authentication-Results. */
  authority: string | null;
};

/**
 * The receiving server's verdict on SPF, DKIM and DMARC. Only the topmost
 * Authentication-Results header is used: it was added by the last server,
 * the one the recipient trusts, while lower ones could be forged.
 */
export function authenticationOf(headers: Header[]): Authentication {
  const top = headerValues(headers, "authentication-results")[0] ?? "";
  const authority = /^\s*([^;\s]+)/.exec(top)?.[1] ?? null;
  const spfMatch = /\bspf=(\w+)(?:[^;]*?smtp\.mailfrom=([^\s;]+))?/i.exec(top);
  const dmarcMatch = /\bdmarc=(\w+)(?:\s*\(([^)]*)\))?(?:[^;]*?header\.from=([^\s;]+))?/i.exec(top);
  const dkim = [...top.matchAll(/\bdkim=(\w+)(?:[^;]*?header\.(?:d|i)=@?([^\s;]+))?/gi)].map((match) => ({
    result: match[1].toLowerCase() as AuthResult,
    domain: match[2] ? domainOf(match[2]) : null,
  }));
  let spf: Authentication["spf"] = spfMatch
    ? { result: spfMatch[1].toLowerCase() as AuthResult, domain: spfMatch[2] ? domainOf(spfMatch[2]) : null }
    : null;

  // Some servers only write Received-SPF.
  if (!spf) {
    const received = headerValues(headers, "received-spf")[0];
    const result = received ? /^\s*(\w+)/.exec(received)?.[1]?.toLowerCase() : null;

    if (result) {
      spf = { result: result as AuthResult, domain: /envelope-from=<?([^>\s;]+)/i.exec(received ?? "")?.[1]?.split("@").pop() ?? null };
    }
  }

  const policy = dmarcMatch?.[2] ? /\bp=(\w+)/i.exec(dmarcMatch[2])?.[1]?.toLowerCase() ?? null : null;

  return {
    spf,
    dkim,
    dmarc: dmarcMatch
      ? { result: dmarcMatch[1].toLowerCase() as AuthResult, policy, domain: dmarcMatch[3] ? domainOf(dmarcMatch[3]) : null }
      : null,
    authority,
  };
}

function domainOf(value: string): string {
  return value.split("@").pop()!.replace(/[>"']/g, "").replace(/\.$/, "").toLowerCase();
}

/** "X-Originating-IP: [73.162.45.10]": the sender's own address, as some webmail services record it. */
export function originatingIp(headers: Header[]): string | null {
  for (const name of ["x-originating-ip", "x-sender-ip", "x-real-ip", "x-client-ip"]) {
    const value = headerValues(headers, name)[0];
    const ip = value ? canonicalIp(value.replace(/[[\]\s]/g, "")) : null;

    if (ip && !isNonPublicIp(ip)) {
      return ip;
    }
  }

  return null;
}
