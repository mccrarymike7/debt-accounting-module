import type { Metadata } from "next";
import { Mulish, Playfair_Display } from "next/font/google";
import { Providers } from "@/components/Providers";
import "./globals.css";

const mulish = Mulish({
  variable: "--font-mulish",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
});

const playfair = Playfair_Display({
  variable: "--font-playfair",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
});

export const metadata: Metadata = {
  title: "Aspida Debt Accounting",
  description: "Corporate debt accounting module for multi-entity borrowings and funding agreements",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${mulish.variable} ${playfair.variable} h-full antialiased`}>
      <body className="min-h-full font-sans">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
