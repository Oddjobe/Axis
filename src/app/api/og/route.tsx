import { ImageResponse } from "next/og";
import { NextRequest } from "next/server";

export const runtime = "edge";

export async function GET(request: NextRequest) {
    const { searchParams } = new URL(request.url);
    const country = searchParams.get("country") || "AXIS AFRICA";
    const score = searchParams.get("score") || "";
    const status = searchParams.get("status") || "";

    return new ImageResponse(
        (
            <div
                style={{
                    width: "100%",
                    height: "100%",
                    display: "flex",
                    flexDirection: "column",
                    justifyContent: "center",
                    alignItems: "center",
                    background: "linear-gradient(135deg, #050A15 0%, #0f172a 50%, #1e293b 100%)",
                    fontFamily: "monospace",
                    color: "white",
                    padding: "60px",
                }}
            >
                <div style={{ fontSize: 24, color: "#94a3b8", letterSpacing: "0.3em", marginBottom: 20, display: "flex" }}>
                    AXIS AFRICA INTELLIGENCE
                </div>
                <div style={{ fontSize: 64, fontWeight: "bold", marginBottom: 20, display: "flex" }}>
                    {country.toUpperCase()}
                </div>
                {score && (
                    <div style={{ display: "flex", gap: 30, marginTop: 10 }}>
                        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "20px 40px", border: "2px solid rgba(37,99,235,0.5)", borderRadius: 12, background: "rgba(37,99,235,0.1)" }}>
                            <div style={{ fontSize: 18, color: "#94a3b8", display: "flex" }}>AXIS SCORE</div>
                            <div style={{ fontSize: 48, fontWeight: "bold", color: "#2563eb", display: "flex" }}>{score}/100</div>
                        </div>
                        {status && (
                            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "20px 40px", border: "2px solid rgba(34,197,94,0.5)", borderRadius: 12, background: "rgba(34,197,94,0.1)" }}>
                                <div style={{ fontSize: 18, color: "#94a3b8", display: "flex" }}>STATUS</div>
                                <div style={{ fontSize: 48, fontWeight: "bold", color: "#22c55e", display: "flex" }}>{status.toUpperCase()}</div>
                            </div>
                        )}
                    </div>
                )}
                <div style={{ fontSize: 16, color: "#475569", marginTop: 40, display: "flex" }}>
                    axis-mocha.vercel.app
                </div>
            </div>
        ),
        { width: 1200, height: 630 }
    );
}
