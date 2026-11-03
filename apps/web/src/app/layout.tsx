import type { Metadata } from "next";
import "./globals.css";
import { TopBar } from "../components/layout/top-bar";
import { AuthProvider } from "../features/auth/auth-context";

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
    <html lang="en">
      <body>
        <AuthProvider>
          <TopBar />
          <main>{children}</main>
        </AuthProvider>
      </body>
    </html>
  );
}
