import "server-only";

import type { Network } from "@/lib/analyze";
import { canonicalIp, sameIp } from "@/lib/ip";
import { getSessionCache, setSessionCache } from "@/lib/session-cache";

const BULK = "https://api.ipgeolocation.io/v3/ipgeo-bulk";
const TIMEOUT_MS = 10000;
const FIELDS = [
  "hostname",
  "network.connection_type",
  "asn.as_number",
  "asn.organization",
  "asn.type",
  "company.name",
  "location.city",
  "location.country_name",
  "location.country_code2",
  "abuse.emails",
].join(",");

export type LookupResult = { networks: Map<string, Network>; problem: string | null };

/**
 * One bulk call for every hop address (at most 40, under the bulk limit).
 * The endpoint answers in request order with failures in place, so results
 * are joined back by position.
 */
export async function lookUp(ips: string[]): Promise<LookupResult> {
  const networks = new Map<string, Network>();
  const missing: string[] = [];

  for (const ip of ips) {
    const cached = getSessionCache<Network>(`net:${ip}`);

    if (cached) {
      networks.set(ip, cached);
    } else {
      missing.push(ip);
    }
  }

  if (missing.length === 0) {
    return { networks, problem: null };
  }

  const apiKey = process.env.IPGEOLOCATION_API_KEY;

  if (!apiKey) {
    return { networks, problem: "Set IPGEOLOCATION_API_KEY in your .env file to look up where each server is." };
  }

  try {
    const params = new URLSearchParams({ apiKey, include: "network,hostname,abuse", fields: FIELDS });
    const response = await fetch(`${BULK}?${params.toString()}`, {
      method: "POST",
      cache: "no-store",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify({ ips: missing }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    if (!response.ok) {
      return {
        networks,
        problem:
          response.status === 429
            ? "The API's request limit was reached, so the servers couldn't be located. Try again in a minute."
            : `The IP lookup failed with status ${response.status}, so the servers couldn't be located.`,
      };
    }

    const payload = (await response.json()) as unknown;

    if (!Array.isArray(payload)) {
      return { networks, problem: "The IP lookup sent back something this tool could not read." };
    }

    missing.forEach((ip, index) => {
      const item = asObject(payload[index]);

      if (!item || typeof item.message === "string") {
        return;
      }

      const network = toNetwork(item, ip);
      networks.set(ip, network);
      setSessionCache(`net:${ip}`, network);
    });

    return { networks, problem: null };
  } catch {
    return { networks, problem: "ipgeolocation.io could not be reached in time, so the servers couldn't be located." };
  }
}

function toNetwork(item: Record<string, unknown>, ip: string): Network {
  const location = asObject(item.location);
  const network = asObject(item.network);
  const asn = asObject(item.asn);
  const company = asObject(item.company);
  const abuse = asObject(item.abuse);
  const hostname = text(item.hostname).replace(/\.$/, "");
  const emails = Array.isArray(abuse?.emails) ? abuse.emails.filter((email): email is string => typeof email === "string") : [];

  return {
    ip: canonicalIp(ip) ?? ip,
    // The API echoes the address when there is no reverse DNS name.
    hostname: hostname && !sameIp(hostname, ip) && !/\.(in-addr|ip6)\.arpa$/i.test(hostname) ? hostname.toLowerCase() : null,
    city: text(location?.city),
    country: text(location?.country_name),
    countryCode: text(location?.country_code2),
    asn: text(asn?.as_number),
    organization: text(asn?.organization) || text(company?.name),
    asnType: text(asn?.type).toUpperCase(),
    connectionType: text(network?.connection_type),
    abuseEmail: emails[0] ?? null,
  };
}

const PLACEHOLDERS = new Set(["", "??", "-", "unknown", "none specified"]);

function text(value: unknown): string {
  const value_ = typeof value === "string" ? value.trim() : "";

  return PLACEHOLDERS.has(value_.toLowerCase()) ? "" : value_;
}

function asObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}
