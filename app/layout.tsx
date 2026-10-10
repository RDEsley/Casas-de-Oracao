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
    icon: [
      { url: "/favicons/favicon.ico", sizes: "48x48" },
      { url: "/favicons/icon.svg", type: "image/svg+xml" },
      { url: "/favicons/favicon-32x32.png", sizes: "32x32", type: "image/png" },
      { url: "/favicons/favicon-192x192.png", sizes: "192x192", type: "image/png" },
    ],
    apple: [{ url: "/favicons/favicon-180x180.png", sizes: "180x180", type: "image/png" }],
    shortcut: "/favicons/favicon.ico",
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
  themeColor: "#ffffff",
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
