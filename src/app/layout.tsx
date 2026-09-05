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
  title: "TableTally",
  description: "Your playgroup's hub for collections, decks, store stock, games, and stats.",
};

// Inline script to set theme before paint — prevents flash of wrong theme
const themeScript = `
  (function() {
    var t = localStorage.getItem('theme');
    if (t === 'light') {
      document.documentElement.classList.remove('dark');
    } else {
      document.documentElement.classList.add('dark');
    }
  })();
`;

export default function RootLayout({
children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body
        className={`${archivo.variable} ${archivoNarrow.variable} antialiased`}
      >
        <div className="mx-auto max-w-[1600px] px-4 lg:px-8">
          <ConditionalHeader />
          {children}
        </div>
      </body>
    </html>
  );
}
