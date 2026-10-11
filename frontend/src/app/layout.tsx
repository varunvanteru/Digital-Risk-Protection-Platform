import type { Metadata, Viewport } from "next";
import { Archivo, IBM_Plex_Mono, IBM_Plex_Sans, Inter } from "next/font/google";
import { AppShell } from "@/components/shell";
import { StoreProvider } from "@/lib/store";
import { THEME_BOOT_SCRIPT } from "@/lib/theme";
import "./globals.css";

const plexSans = IBM_Plex_Sans({
  variable: "--font-plex-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

const plexMono = IBM_Plex_Mono({
  variable: "--font-plex-mono",
  subsets: ["latin"],
  weight: ["400", "500"],
});

// Archivo for titles, Inter for interface text.
const archivo = Archivo({ variable: "--font-archivo", subsets: ["latin"], weight: ["600", "700"] });
const inter = Inter({ variable: "--font-inter", subsets: ["latin"], weight: ["400", "500", "600", "700"] });

export const metadata: Metadata = {
  title: { default: "IMPOSTR", template: "%s · IMPOSTR" },
  description: "Find fake social profiles, brand pages and apps impersonating your brand.",
  applicationName: "IMPOSTR",
  // iPhone / iPad home-screen app (Safari ignores the web manifest's icons).
  appleWebApp: { capable: true, title: "IMPOSTR", statusBarStyle: "default" },
  icons: {
    icon: [{ url: "/icons/impostr-favicon-32.png", sizes: "32x32", type: "image/png" }],
    apple: [{ url: "/icons/impostr-apple-180.png", sizes: "180x180" }],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover", // use the full screen on phones with a notch
  themeColor: "#111111",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    // Font variables on <html>, where the theme variables that use them are defined.
    <html
      lang="en"
      suppressHydrationWarning
      className={`${plexSans.variable} ${plexMono.variable} ${archivo.variable} ${inter.variable}`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT_SCRIPT }} />
      </head>
      <body className="antialiased">
        <StoreProvider>
          <AppShell>{children}</AppShell>
        </StoreProvider>
      </body>
    </html>
  );
}
