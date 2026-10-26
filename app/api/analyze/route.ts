import { NextResponse } from "next/server";

import { addressesToLookUp, analyze } from "@/lib/analyze";
import { lookUp } from "@/lib/lookup";
import { MAX_INPUT } from "@/lib/parse";

export const dynamic = "force-dynamic";

/**
 * Headers arrive by POST, never in a URL, because they carry names and
 * addresses. Nothing is stored or logged; only the server addresses found in
 * the Received chain are sent on, to ipgeolocation.io.
 */
export async function POST(request: Request) {
  let raw: unknown;

  try {
    raw = ((await request.json()) as { headers?: unknown }).headers;
  } catch {
    return NextResponse.json({ error: "Send the headers as JSON: { \"headers\": \"...\" }." }, { status: 400 });
  }

  if (typeof raw !== "string" || raw.trim() === "") {
    return NextResponse.json({ error: "Paste the email's headers first." }, { status: 400 });
  }

  if (raw.length > MAX_INPUT) {
    return NextResponse.json(
      { error: "That is longer than a header block normally is. Paste the headers only, without the message body or attachments." },
      { status: 413 },
    );
  }

  const ips = addressesToLookUp(raw);
  const { networks, problem } = ips.length > 0 ? await lookUp(ips) : { networks: new Map(), problem: null };
  const report = analyze(raw, networks);

  return NextResponse.json(
    { report, networks: Object.fromEntries(networks), lookupProblem: problem },
    { headers: { "Cache-Control": "no-store" } },
  );
}
