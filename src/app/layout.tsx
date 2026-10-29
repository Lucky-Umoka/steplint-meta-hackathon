import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "StepLint", description: "Visual verification for physical procedures — in development.",
};
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
