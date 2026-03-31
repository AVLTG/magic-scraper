import type { Metadata } from "next";
import { Archivo, Archivo_Narrow } from "next/font/google";
import "./globals.css";
import ConditionalHeader from "./components/conditional-header";

const archivo = Archivo({
  variable: "--font-archivo",
  subsets: ["latin"],
});

const archivoNarrow = Archivo_Narrow({
  variable: "--font-archivo-narrow",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "MTG Card Search",
  description: "",
};

export default function RootLayout({
children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body
        className={`${archivo.variable} ${archivoNarrow.variable} antialiased`}
      >
        <div className="mx-auto max-w-7xl px-6 lg:px-10">
          <ConditionalHeader />
          {children}
        </div>
      </body>
    </html>
  );
}
