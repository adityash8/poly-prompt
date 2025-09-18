import type { Metadata } from "next"
import { Geist, Geist_Mono } from "next/font/google"
import "./globals.css"
import { RootLayoutClient } from "@/components/root-layout-client"

const geist = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
})

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
})

export const metadata: Metadata = {
  title: "Poly Prompt - One prompt. Every LLM. Side-by-side.",
  description: "Compare prompts across multiple LLMs instantly. Built for speed, clarity, and sharing.",
  keywords: ["LLM", "AI", "prompt engineering", "comparison", "OpenAI", "Claude", "Gemini"],
  authors: [{ name: "Poly Prompt Team" }],
  openGraph: {
    title: "Poly Prompt - LLM Comparison Tool",
    description: "Compare prompts across multiple LLMs instantly",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Poly Prompt - LLM Comparison Tool",
    description: "Compare prompts across multiple LLMs instantly",
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className={`${geist.variable} ${geistMono.variable}`}>
      <body className="antialiased">
        <RootLayoutClient>
          {children}
        </RootLayoutClient>
      </body>
    </html>
  )
}
