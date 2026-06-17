import "./globals.css"
import Sidebar from "@/components/Sidebar"
import { Toaster } from "react-hot-toast"

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className="flex bg-gray-100 min-h-screen">
        <Sidebar />
        <main className="flex-1 p-10">
          {children}
        </main>
        <Toaster position="top-right" />
      </body>
    </html>
  )
}