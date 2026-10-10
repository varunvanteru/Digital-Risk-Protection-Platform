import type { Metadata } from "next";
import { Archivo, IBM_Plex_Mono, IBM_Plex_Sans, Montserrat } from "next/font/google";
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

// Crimson theme: Archivo for titles, Montserrat for text.
const archivo = Archivo({ variable: "--font-archivo", subsets: ["latin"], weight: ["600", "700"] });
const montserrat = Montserrat({ variable: "--font-montserrat", subsets: ["latin"], weight: ["400", "500", "600", "700"] });

export const metadata: Metadata = {
  title: { default: "BrandShield", template: "%s · BrandShield" },
  description: "Find fake social profiles, brand pages and apps impersonating your brand.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    // Font variables on <html>, where the theme variables that use them are defined.
    <html
      lang="en"
      suppressHydrationWarning
      className={`${plexSans.variable} ${plexMono.variable} ${archivo.variable} ${montserrat.variable}`}
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
