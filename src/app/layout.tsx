import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "AXIS AFRICA | African X-ray Intelligence System",
  description: "Real-time strategic intelligence platform tracking sovereignty, resource wealth, and outside influence across all 54 African nations.",
  keywords: ["Africa", "geopolitics", "sovereignty", "intelligence", "AfCFTA", "resources", "OSINT", "strategic analysis"],
  authors: [{ name: "AXIS AFRICA" }],
  openGraph: {
    title: "AXIS AFRICA — African X-ray Intelligence System",
    description: "Live sovereignty scores, heat-mapped resources, and geopolitical intelligence for all 54 African nations. Open source.",
    url: "https://axis-mocha.vercel.app",
    siteName: "AXIS AFRICA",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "AXIS AFRICA Dashboard — Sovereignty heat map of the African continent",
      },
    ],
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "AXIS AFRICA — African X-ray Intelligence System",
    description: "Live sovereignty scores, heat-mapped resources, and geopolitical intelligence for all 54 African nations.",
    images: ["/og-image.png"],
  },
  icons: {
    icon: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased min-h-screen bg-background text-foreground transition-colors duration-300`}
      >
        <ThemeProvider
          attribute="class"
          defaultTheme="dark"
          enableSystem={false}
          disableTransitionOnChange
        >
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
