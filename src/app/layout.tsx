import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  icons: { icon: [{ url: "/icon.svg", type: "image/svg+xml" }, { url: "/favicon.ico", sizes: "32x32" }] },
  title: "StepLint", description: "Visual verification for physical procedures — in development.",
};
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
