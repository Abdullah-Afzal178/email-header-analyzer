import { ImageResponse } from "next/og";

import { PAGE_TITLE, SITE_NAME } from "@/lib/constants";

export const alt = PAGE_TITLE;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const HOPS = [
  { code: "US", label: "73.162.45.10, home cable" },
  { code: "US", label: "159.89.100.10, cloud server" },
  { code: "US", label: "mx.google.com" },
];

export default function OpenGraphImage() {
  const stripe = "repeating-linear-gradient(-45deg, #c8383a 0 18px, #f8f4ea 18px 28px, #2a5aa8 28px 46px, #f8f4ea 46px 56px)";

  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", background: "#f8f4ea", color: "#1b2a4a", fontFamily: "sans-serif" }}>
        <div style={{ display: "flex", height: "18px", backgroundImage: stripe }} />
        <div style={{ display: "flex", flex: 1, padding: "54px 72px", justifyContent: "space-between" }}>
          <div style={{ display: "flex", flexDirection: "column", width: "620px" }}>
            <div style={{ display: "flex", fontSize: "26px", fontWeight: 700, color: "#c8383a" }}>{SITE_NAME}</div>
            <div style={{ display: "flex", marginTop: "18px", fontSize: "70px", fontWeight: 800, lineHeight: 1.05 }}>
              Where did this email really come from?
            </div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "22px", justifyContent: "center" }}>
            {HOPS.map((hop, index) => (
              <div key={index} style={{ display: "flex", alignItems: "center", gap: "18px" }}>
                <div
                  style={{
                    display: "flex",
                    width: "86px",
                    height: "86px",
                    borderRadius: "50%",
                    border: "4px dashed #c8383a",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "#c8383a",
                    fontSize: "28px",
                    fontWeight: 700,
                  }}
                >
                  {hop.code}
                </div>
                <div style={{ display: "flex", fontSize: "24px" }}>{hop.label}</div>
              </div>
            ))}
          </div>
        </div>
        <div style={{ display: "flex", height: "18px", backgroundImage: stripe }} />
      </div>
    ),
    size,
  );
}
