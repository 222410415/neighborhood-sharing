import type { Metadata } from "next";
import { DM_Sans, Sora } from "next/font/google";
import "./globals.css";
import { TopBar } from "../components/layout/top-bar";
import { AuthProvider } from "../features/auth/auth-context";

const sora = Sora({ subsets: ["latin"], weight: ["500", "600"], variable: "--font-sora", display: "swap" });
const dmSans = DM_Sans({ subsets: ["latin"], weight: ["400", "500", "700"], variable: "--font-dm-sans", display: "swap" });

export const metadata: Metadata = {
  title: "Neighborhood | Borrow and share nearby",
  description:
    "Discover useful things to borrow and rent from neighbors in Riyadh.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${sora.variable} ${dmSans.variable}`}>
      <body>
        <AuthProvider>
          <TopBar />
          <main>{children}</main>
        </AuthProvider>
      </body>
    </html>
  );
}
