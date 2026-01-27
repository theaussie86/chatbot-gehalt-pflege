
import { createClient } from '../../utils/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { signOut } from '../actions/auth'

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
           <Link href="/" className="block px-4 py-2 text-gray-700 hover:bg-gray-100 rounded dark:text-gray-300 dark:hover:bg-gray-700">
            Overview
          </Link>
           <Link href="/projects" className="block px-4 py-2 text-gray-700 hover:bg-gray-100 rounded dark:text-gray-300 dark:hover:bg-gray-700">
            Projects
          </Link>
          <Link href="/test-widget" className="block px-4 py-2 text-gray-700 hover:bg-gray-100 rounded dark:text-gray-300 dark:hover:bg-gray-700">
            Test Widget
          </Link>
          <Link href="/documents" className="block px-4 py-2 text-gray-700 hover:bg-gray-100 rounded dark:text-gray-300 dark:hover:bg-gray-700">
            Documents
          </Link>
          <Link href="/inquiries" className="block px-4 py-2 text-gray-700 hover:bg-gray-100 rounded dark:text-gray-300 dark:hover:bg-gray-700">
            Anfragen
          </Link>

        </nav>
         <div className="absolute bottom-0 w-64 p-4 border-t dark:border-gray-700">
            <div className="text-sm text-gray-500 dark:text-gray-400">
              Logged in as: <br/>
              <span className="font-medium text-gray-700 dark:text-gray-300 truncate block">{user.email}</span>
            </div>
            <form action={signOut} className="mt-2">
              <button 
                type="submit" 
                className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50 rounded dark:text-red-400 dark:hover:bg-gray-700 transition-colors"
              >
                Sign out
              </button>
            </form>
        </div>
      </aside>
      <main className="flex-1 p-8 overflow-auto">
        {children}
      </main>
    </div>
  )
}
