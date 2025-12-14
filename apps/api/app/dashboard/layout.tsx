
import { createClient } from '../../utils/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  return (
    <div className="flex h-screen bg-gray-100 dark:bg-gray-900">
      <aside className="w-64 bg-white shadow-md dark:bg-gray-800">
        <div className="p-4 border-b dark:border-gray-700">
          <h1 className="text-xl font-bold text-gray-800 dark:text-white">Chatbot Admin</h1>
        </div>
        <nav className="p-4 space-y-2">
           <Link href="/dashboard" className="block px-4 py-2 text-gray-700 hover:bg-gray-100 rounded dark:text-gray-300 dark:hover:bg-gray-700">
            Overview
          </Link>
          <Link href="/dashboard/test-widget" className="block px-4 py-2 text-gray-700 hover:bg-gray-100 rounded dark:text-gray-300 dark:hover:bg-gray-700">
            Test Widget
          </Link>
           <Link href="/dashboard/embed-code" className="block px-4 py-2 text-gray-700 hover:bg-gray-100 rounded dark:text-gray-300 dark:hover:bg-gray-700">
            Get Embed Code
          </Link>
        </nav>
         <div className="absolute bottom-0 w-64 p-4 border-t dark:border-gray-700">
            <div className="text-sm text-gray-500 dark:text-gray-400">
              Logged in as: <br/>
              <span className="font-medium text-gray-700 dark:text-gray-300 truncate block">{user.email}</span>
            </div>
            {/* Add logout button later if needed, middleware handles session */}
        </div>
      </aside>
      <main className="flex-1 p-8 overflow-auto">
        {children}
      </main>
    </div>
  )
}
