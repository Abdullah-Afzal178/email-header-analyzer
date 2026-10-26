# Email Header Analyzer

Where did this email really come from? Paste a message's raw headers to trace every server it passed through, where each one is and who runs it, and whether SPF, DKIM and DMARC checked out. Spoofed senders and phishing tells are called out in plain language. Powered by [ipgeolocation.io](https://ipgeolocation.io).

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Built with Next.js](https://img.shields.io/badge/Built%20with-Next.js-000?logo=nextdotjs)](https://nextjs.org/)
[![Powered by ipgeolocation.io](https://img.shields.io/badge/Powered%20by-ipgeolocation.io-c8383a)](https://ipgeolocation.io)

<!-- Add a screenshot of the tool running locally at ./public/tool.png and reference it here -->

---

## What It Does

- **The route**, hop by hop from the sender to your mail server: each server's address, the name it announced, its reverse DNS name, network, location, protocol and how long it held the message.
- **The sender's network**: the earliest public address in the chain, whether it is a home line, a mobile network or a cloud server, and where to report abuse.
- **Authentication**: the receiving server's SPF, DKIM and DMARC verdicts, explained.
- **Findings**, worst first:
  - DMARC, SPF or DKIM failures
  - a display name that shows a different address (`"service@paypal.com" <billing@paypa1-secure.com>`)
  - replies that go to another domain
  - bounces handled by another domain
  - a message sent from a home or mobile connection
  - hops whose clocks disagree, and hops that held the message for a long time
- **How to copy headers** from Gmail, Outlook, Apple Mail, Yahoo Mail and Thunderbird.

Two samples, a phishing attempt and an ordinary Gmail message, show what each looks like.

---

## Design notes

**Only the trustworthy headers decide.** A sender can write anything into a message before it leaves, including fake Received lines and a fake Authentication-Results. So only the topmost Authentication-Results, the one added by the server that delivered the message, is used.

**The observed address, not the announced one.** A Received line holds the name the connecting machine announced (often a private address like `[192.168.1.23]`) and the address the server actually saw. The second one is what gets traced.

**It reads the formats real servers write.** Gmail, Postfix, Exchange (bare IPv6 in the comment), `[IPv6:...]` addresses, missing `from` clauses, "unknown" reverse names, and folded lines. The parser splits clauses only outside brackets, so a host called `mx.by.example.com` doesn't confuse it.

**Headers never go in a URL.** They carry names, addresses and subject lines, so they are posted to this site's own endpoint, not stored, and not logged. Only the server addresses from the route go to ipgeolocation.io.

---

## Why ipgeolocation.io

- **[IP Geolocation API](https://ipgeolocation.io/documentation/ip-location-api.html)**, bulk endpoint, with `include=network,hostname,abuse`: one call locates every hop and returns its network, ASN type, connection type, reverse DNS name and abuse contact.
- **Free tier**: all of it works on the free plan, cached for 30 minutes per address.

**[Get your free API key →](https://ipgeolocation.io/signup)**

---

## What this is not

Headers show the route and the receiving server's verdicts. They can't prove who typed the message, and webmail services usually hide the sender's own address. A clean report means the message came from where it says, not that its content is safe.

---

## Features

- **Hop-by-hop route** drawn as postmarks, with the origin and your own mail server marked
- **SPF, DKIM and DMARC** read from the trustworthy header only
- **Phishing tells** in plain language, worst first
- **Where to report abuse** for the sending network
- **Private by design**: headers are posted, never put in a URL, and never stored
- **SEO-ready**: Open Graph tags, meta description, `robots.txt`, `sitemap.xml` and favicon

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | [Next.js](https://nextjs.org/) (App Router) |
| Styling | [Tailwind CSS](https://tailwindcss.com/) |
| Language | TypeScript |
| Fonts | Archivo and DM Mono via `next/font` |
| Icons | [lucide-react](https://lucide.dev/) |
| Data | [ipgeolocation.io](https://ipgeolocation.io) |

---

## Getting Started

### Prerequisites

- Node.js 18+
- An [ipgeolocation.io](https://ipgeolocation.io/signup) API key (the free tier is enough)

### Run It Locally

1. Clone the repo:

```bash
git clone https://github.com/Abdullah-Afzal178/email-header-analyzer.git
cd email-header-analyzer
```

2. Install dependencies:

```bash
npm install
```

3. Create a `.env` file in the project root:

```env
IPGEOLOCATION_API_KEY=your_api_key_here
```

4. Start the development server:

```bash
npm run dev
```

5. Open [http://localhost:3000](http://localhost:3000) and try one of the samples.

---

## Tests

The header parser, the Received formats of different mail servers, authentication results, the report's findings and the IP helpers are pure functions:

```bash
npm test
```

---

## API

`POST /api/analyze` with `{ "headers": "..." }` returns the report as JSON: the summary, the hops, the origin, the authentication results, the findings and the network for each address. Up to 64 KB of headers; anything after the first blank line (the message body) is ignored.

---

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `IPGEOLOCATION_API_KEY` | Yes | Your [ipgeolocation.io](https://ipgeolocation.io/signup) API key |
| `NEXT_PUBLIC_SITE_URL` | No | Your production URL if you deploy (used for the sitemap and robots.txt) |

---

## Project Structure

```
email-header-analyzer/
├── app/
│   ├── layout.tsx
│   ├── page.tsx                 # Hero, analyzer, how-to, notes
│   ├── api/analyze/route.ts     # POST endpoint
│   ├── opengraph-image.tsx
│   ├── robots.ts
│   └── sitemap.ts
├── components/
│   ├── analyzer.tsx             # Paste rail and report (client)
│   └── powered-by-badge.tsx
├── lib/
│   ├── parse.ts                 # Headers, Received chain, authentication (pure)
│   ├── analyze.ts               # Findings and the report (pure)
│   ├── samples.ts               # The two sample messages
│   ├── ip.ts                    # IP parsing and private ranges (pure)
│   ├── lookup.ts                # Bulk IP lookup (server only)
│   └── session-cache.ts
├── .env                         # API key (not committed)
└── README.md
```

---

## Want to Deploy It?

Works out of the box on any platform that supports Next.js:

- **Vercel**: import the repo, add `IPGEOLOCATION_API_KEY`, deploy.
- **Netlify**, **Cloudflare Pages**, **Railway**: a similar process.
- **Self-hosted**: `npm run build && npm start`.

---

## License

MIT. See [LICENSE](LICENSE) for details.
