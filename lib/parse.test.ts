import assert from "node:assert/strict";

import { addressesToLookUp, analyze, formatSeconds, kindOf, sameOrganisation, type Network } from "@/lib/analyze";
import { authenticationOf, hopsOf, parseMailbox, parseReceived, unfold } from "@/lib/parse";
import { NORMAL_SAMPLE, SUSPICIOUS_SAMPLE } from "@/lib/samples";

let checks = 0;
function check(actual: unknown, expected: unknown, message: string) {
  checks += 1;
  assert.deepEqual(actual, expected, message);
}

// --- unfolding ----------------------------------------------------------------------
const folded = unfold("Subject: Hello\n  world\nFrom: a@b.com\n\nThis is the body\nNot: a header");
check(folded, [{ name: "Subject", value: "Hello world" }, { name: "From", value: "a@b.com" }], "folded lines join, and the body is ignored");
check(unfold("\n\nX-Test: 1\r\nX-Other: 2"), [{ name: "X-Test", value: "1" }, { name: "X-Other", value: "2" }], "leading blank lines and CRLF");
check(unfold("not a header at all"), [], "nothing header-like");

// --- Received formats from different servers ---------------------------------------------
const gmail = parseReceived(
  "from mail-sor-f41.google.com (mail-sor-f41.google.com. [209.85.220.41]) by mx.google.com with SMTPS id abc for <x@example.com> (Google Transport Security); Tue, 13 Oct 2026 09:15:03 -0700 (PDT)",
);
check([gmail.helo, gmail.reverseName, gmail.ip, gmail.by, gmail.protocol], ["mail-sor-f41.google.com", "mail-sor-f41.google.com", "209.85.220.41", "mx.google.com", "SMTPS"], "Gmail");
check(gmail.time, Date.UTC(2026, 9, 13, 16, 15, 3), "date with a (PDT) comment");

const postfix = parseReceived(
  "from [192.168.1.23] (c-73-162-45-10.hsd1.ca.comcast.net [73.162.45.10]) by mail.example.net (Postfix) with ESMTPSA id 4F2A81C0123 for <x@example.com>; Tue, 13 Oct 2026 14:42:15 +0000 (UTC)",
);
check([postfix.helo, postfix.ip, postfix.reverseName, postfix.by], ["192.168.1.23", "73.162.45.10", "c-73-162-45-10.hsd1.ca.comcast.net", "mail.example.net"], "Postfix: the observed address, not the announced one");
check(postfix.internal, false, "a public address is not internal");

const unknown = parseReceived("from laptop (unknown [73.162.45.10]) by mx.example.org (Postfix) with ESMTP id 1; Tue, 13 Oct 2026 14:42:15 +0000");
check([unknown.ip, unknown.reverseName], ["73.162.45.10", null], "“unknown” is not a reverse name");

const exchange = parseReceived(
  "from BN8PR12MB3456.namprd12.prod.outlook.com (2603:10b6:408:e5::22) by SA1PR12MB7890.namprd12.prod.outlook.com with HTTPS; Tue, 13 Oct 2026 14:42:15 +0000",
);
check([exchange.ip, exchange.by, exchange.protocol], ["2603:10b6:408:e5::22", "SA1PR12MB7890.namprd12.prod.outlook.com", "HTTPS"], "Exchange writes a bare IPv6 address");

const v6 = parseReceived("from mail.example.org (mail.example.org [IPv6:2001:4860:4864:20::2b]) by mx.example.com with ESMTPS id 9; Tue, 13 Oct 2026 14:42:15 +0000");
check(v6.ip, "2001:4860:4864:20::2b", "IPv6: prefix");

const local = parseReceived("from localhost (localhost [127.0.0.1]) by mail.example.net (Postfix) with ESMTP id 2; Tue, 13 Oct 2026 14:42:15 +0000");
check([local.ip, local.internal], ["127.0.0.1", true], "loopback is internal");

const byOnly = parseReceived("by 2002:a05:7208:3c4a:b0:9a:1c2e:7f01 with SMTP id k10csp2184532rbd; Tue, 13 Oct 2026 07:42:21 -0700 (PDT)");
check([byOnly.ip, byOnly.helo, byOnly.by], [null, null, "2002:a05:7208:3c4a:b0:9a:1c2e:7f01"], "a hop with no from clause");

const tricky = parseReceived("from mx.by.example.com (mx.by.example.com [198.51.100.7]) by relay.example.com with ESMTP id for5; Tue, 13 Oct 2026 14:42:15 +0000");
check([tricky.helo, tricky.by], ["mx.by.example.com", "relay.example.com"], "keywords inside hostnames don't split clauses");
check(parseReceived("from x (y [10.0.0.1]) by z; not a date").time, null, "an unreadable date");

// --- the chain ---------------------------------------------------------------------------------
const suspicious = unfold(SUSPICIOUS_SAMPLE);
const hops = hopsOf(suspicious);
check(hops.map((hop) => hop.step), [1, 2, 3], "three hops, first hop first");
check(hops.map((hop) => hop.ip), ["73.162.45.10", "159.89.100.10", null], "the sender's home line, then the bulk mailer");
check(hops.map((hop) => hop.delay), [null, 5, 1], "delays between hops, in seconds");

// --- mailboxes and authentication ---------------------------------------------------------------------
check(parseMailbox('"service@paypal.com" <billing@paypa1-secure.com>'), { display: "service@paypal.com", address: "billing@paypa1-secure.com", domain: "paypa1-secure.com" }, "a display name that is an address");
check(parseMailbox("sam.rivera@gmail.com"), { display: null, address: "sam.rivera@gmail.com", domain: "gmail.com" }, "a bare address");
check(parseMailbox("Sam Rivera <Sam.Rivera@Gmail.com>").domain, "gmail.com", "lower-cased");
check(parseMailbox(undefined).address, null, "missing");

const auth = authenticationOf(unfold(NORMAL_SAMPLE));
check(auth.spf, { result: "pass", domain: "gmail.com" }, "SPF pass with its domain");
check(auth.dkim, [{ result: "pass", domain: "gmail.com" }], "DKIM pass");
check(auth.dmarc, { result: "pass", policy: "none", domain: "gmail.com" }, "DMARC pass with policy");
check(auth.authority, "mx.google.com", "who wrote the results");

const forged = authenticationOf(
  unfold("Authentication-Results: mx.real.com; spf=fail smtp.mailfrom=a@b.com\nAuthentication-Results: evil.example; spf=pass dkim=pass dmarc=pass"),
);
check(forged.spf?.result, "fail", "only the topmost result counts; lower ones could be forged");
check(authenticationOf(unfold("Received-SPF: Fail (protection.outlook.com: domain of x.com does not designate 1.2.3.4) envelope-from=<a@x.com>")).spf, { result: "fail", domain: "x.com" }, "Received-SPF fallback");

// --- the report ---------------------------------------------------------------------------------------
const comcast: Network = {
  ip: "73.162.45.10",
  hostname: "c-73-162-45-10.hsd1.ca.comcast.net",
  city: "Oakland",
  country: "United States",
  countryCode: "US",
  asn: "AS7922",
  organization: "Comcast Cable Communications, LLC",
  asnType: "ISP",
  connectionType: "Cable",
  abuseEmail: "abuse@comcast.net",
};

check(addressesToLookUp(SUSPICIOUS_SAMPLE), ["73.162.45.10", "159.89.100.10"], "public hop addresses to look up");
const report = analyze(SUSPICIOUS_SAMPLE, new Map([["73.162.45.10", comcast]]));
const titles = report.findings.map((finding) => `${finding.severity}: ${finding.title}`);
check(titles.filter((title) => title.startsWith("bad")), ["bad: DMARC failed", "bad: The display name shows a different address"], "the two red flags");
check(titles.includes("warn: SPF soft fail"), true, "soft fail is a warning");
check(titles.includes("warn: Not DKIM-signed"), true, "unsigned");
check(titles.includes("warn: Replies go to a different domain"), true, "reply-to elsewhere");
check(titles.includes("info: Sent from a home connection"), true, "a home cable line");
check(report.origin, { ip: "73.162.45.10", source: "received", step: 1 }, "origin is the first public hop");
check(report.transitSeconds, 6, "6 seconds end to end");
check(report.findings[0].severity, "bad", "worst first");

const normal = analyze(NORMAL_SAMPLE, new Map());
check(normal.findings.filter((finding) => finding.severity === "bad" || finding.severity === "warn"), [], "a normal Gmail message raises nothing");
check(normal.summary.subject, "Notes from Thursday", "subject");

const bare = analyze("From: a@b.com\nSubject: hi", new Map());
check(bare.findings[0].title, "No Received headers", "nothing to trace is explained");

const xoip = analyze("X-Originating-IP: [73.162.45.10]\nReceived: from x (x [10.0.0.5]) by y; Tue, 13 Oct 2026 14:42:15 +0000", new Map());
check(xoip.origin, { ip: "73.162.45.10", source: "x-originating-ip", step: null }, "X-Originating-IP wins");

const skew = analyze(
  "Received: from b (b [198.51.100.2]) by c; Tue, 13 Oct 2026 14:00:00 +0000\nReceived: from a (a [198.51.100.1]) by b; Tue, 13 Oct 2026 14:30:00 +0000",
  new Map(),
);
check(skew.findings.some((finding) => finding.title === "Clock disagreement at hop 2"), true, "a hop stamped before its predecessor");

// --- helpers --------------------------------------------------------------------------------------------
check(kindOf(comcast), "home", "cable is home");
check(kindOf({ ...comcast, asnType: "HOSTING", connectionType: "" }), "hosting", "hosting");
check(kindOf({ ...comcast, connectionType: "Mobile" }), "mobile", "mobile");
check(sameOrganisation("mail.google.com", "google.com"), true, "subdomain");
check(sameOrganisation("bbc.co.uk", "evil.co.uk"), false, "country-code second levels are kept apart");
check(sameOrganisation("news.bbc.co.uk", "bbc.co.uk"), true, "and matched within");
check(formatSeconds(5), "5 s", "seconds");
check(formatSeconds(1500), "25 min", "minutes");
check(formatSeconds(3720), "1 h 2 min", "hours");

console.log(`parse: ${checks} assertions passed`);
