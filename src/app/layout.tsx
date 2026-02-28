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
  metadataBase: new URL("https://axis-mocha.vercel.app"),
  title: {
    default: "AXIS AFRICA | Open Source Intelligence & Sovereignty Tracker",
    template: "%s | AXIS AFRICA"
  },
  description: "Real-time strategic intelligence platform tracking sovereignty, resource wealth, foreign direct investment, and outside influence across all 54 African nations. Built for OSINT researchers, economists, and geopolitical analysts.",
  keywords: [
    "Africa", "geopolitics", "sovereignty", "intelligence", "AfCFTA",
    "resources", "OSINT", "strategic analysis", "foreign direct investment",
    "FDI", "cobalt", "lithium", "BRICS", "African Union"
  ],
  authors: [{ name: "AXIS AFRICA", url: "https://axis-mocha.vercel.app" }],
  creator: "AXIS AFRICA Intelligence",
  publisher: "AXIS AFRICA",
  formatDetection: {
    email: false,
    address: false,
    telephone: false,
  },
  openGraph: {
    title: "AXIS AFRICA — Live Geopolitical Intelligence System",
    description: "Live sovereignty scores, heat-mapped strategic resources, and deep-scan OSINT alerts for all 54 African nations. Open source intelligence for the continent.",
    url: "https://axis-mocha.vercel.app",
    siteName: "AXIS AFRICA",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "AXIS AFRICA Dashboard — Sovereignty heat map of the African continent with live intelligence feeds",
      },
    ],
    locale: "en_US",
    type: "website",
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
  twitter: {
    card: "summary_large_image",
    title: "AXIS AFRICA | Open Source Intelligence System",
    description: "Live sovereignty scores, heat-mapped resources, and OSINT geopolitical alerts for all 54 African nations.",
    images: ["/og-image.png"],
    creator: "@axis_africa",
  },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
    apple: "/apple-touch-icon.png",
  },
  manifest: "/site.webmanifest",
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
