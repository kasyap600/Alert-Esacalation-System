import "./globals.css"
import { Inter } from "next/font/google"
import Sidebar from "@/components/Sidebar"
import { Toaster } from "react-hot-toast"

const inter = Inter({ subsets: ["latin"], display: "swap" })

export const metadata = {
  title: "WIMERA – Alert Escalation",
  description: "IoT monitoring and alert escalation dashboard",
}

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={inter.className}>
      <body className="flex bg-slate-100 min-h-screen">
        <Sidebar />
        <main className="flex-1 p-8 overflow-auto">
          {children}
        </main>
        <Toaster
          position="top-right"
          toastOptions={{
            style: {
              borderRadius: "10px",
              fontSize: "14px",
              fontWeight: 500,
            },
          }}
        />
      </body>
    </html>
  )
}
