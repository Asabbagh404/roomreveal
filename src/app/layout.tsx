import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { GenerationProvider } from "@/state/generation-context";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "RoomReveal",
  description:
    "Une photo. Une pièce qui se meuble toute seule. Transformez la photo d'une pièce meublée en vidéo de révélation cinématique.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Single dark theme: the "dark" class is hardcoded, there is no theme toggle (UX-DR1).
  return (
    <html
      lang="fr"
      className={`dark ${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <GenerationProvider>{children}</GenerationProvider>
      </body>
    </html>
  );
}
