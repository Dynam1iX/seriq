import type { Metadata } from "next";
import { Montserrat } from "next/font/google";
import "./globals.css";

// Montserrat: аккуратный геометрический шрифт с полной поддержкой казахских букв (ә, ғ, қ, ң, ө, ұ, ү, і)
const montserrat = Montserrat({
  variable: "--font-montserrat",
  subsets: ["latin", "cyrillic", "cyrillic-ext"],
  weight: ["400", "500", "600", "700", "800"],
});

export const metadata: Metadata = {
  title: "SerIQ — разгибание локтя",
  description: "ИИ-помощник домашней реабилитации: оценка цикла упражнения по видео, всё на устройстве",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ru" className={`${montserrat.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
