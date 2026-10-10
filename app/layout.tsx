import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import ServiceWorker from "../components/ServiceWorker";
import { SITE } from "../lib/site";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const title = `${SITE.name} — ${SITE.region}`;

export const metadata: Metadata = {
  metadataBase: new URL(SITE.url),
  title,
  description: SITE.description,
  applicationName: SITE.name,
  authors: [{ name: SITE.author }],
  appleWebApp: { capable: true, title: SITE.shortName, statusBarStyle: "default" },
  manifest: "/site.webmanifest",
  icons: {
    icon: [{ url: "/favicons/icon.svg", type: "image/svg+xml", sizes: "any" }],
    apple: [{ url: "/favicons/icon.svg", type: "image/svg+xml" }],
    shortcut: "/favicons/icon.svg",
  },
  openGraph: {
    title,
    description: SITE.description,
    locale: "pt_BR",
    type: "website",
    url: "/",
    siteName: SITE.name,
    images: [{ url: "/og-casas-de-oracao.png", width: 1200, height: 630, type: "image/png", alt: title }],
  },
  twitter: {
    card: "summary_large_image",
    title,
    description: SITE.description,
    images: ["/og-casas-de-oracao.png"],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#176B4A",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
        <ServiceWorker />
      </body>
    </html>
  );
}
