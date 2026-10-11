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
      { url: "/favicons/icon.svg", sizes: "any", type: "image/svg+xml" },
      { url: "/favicons/favicon.ico", sizes: "any" },
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
    images: [{ url: "/favicons/favicon-512x512.png", width: 512, height: 512, type: "image/png", alt: "Logo do Casas de Oração" }],
  },
  twitter: {
    card: "summary",
    title,
    description: SITE.description,
    images: ["/favicons/favicon-512x512.png"],
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
