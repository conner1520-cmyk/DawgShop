import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, Public_Sans } from "next/font/google";
import { Suspense } from "react";
import { TabBar } from "@/components/tab-bar";
import "./globals.css";

// Body text. globals.css reads this through --font-public-sans.
const publicSans = Public_Sans({
  variable: "--font-public-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

// Display text (wordmark, h1, h2). Loaded as the variable font so the
// optical-size axis matches the prototype; we use weights 600 and 800.
const bricolage = Bricolage_Grotesque({
  variable: "--font-bricolage",
  subsets: ["latin"],
  axes: ["opsz"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "DawgShop",
  description: "Buy and sell with other verified UGA students.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${publicSans.variable} ${bricolage.variable}`}>
      <body>
        <div id="app" className="notabs">
          <main id="view">{children}</main>
          {/* The tab bar reads the URL, which isn't known ahead of time on
              pages like /listings/[id], so it streams in behind Suspense. */}
          <Suspense fallback={null}>
            <TabBar />
          </Suspense>
        </div>
      </body>
    </html>
  );
}
