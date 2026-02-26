import { Outlet } from 'react-router-dom'

import { useAuth } from '@/auth/use-auth'
import { ThemeToggle } from '@/components/theme-toggle'
import { Button } from '@/components/ui/button'

export function AppLayout() {
  const { user, signOut } = useAuth()

  return (
    <div className="min-h-screen bg-muted/30">
      <header className="border-b bg-background">
        <div className="mx-auto flex h-16 w-full max-w-5xl items-center justify-between px-4">
          <p className="text-sm font-medium">AI Image Gallery</p>
          <div className="flex items-center gap-3">
            <ThemeToggle />
            <p className="hidden text-sm text-muted-foreground sm:block">{user?.email}</p>
            <Button variant="outline" size="sm" onClick={() => void signOut()}>
              Sign out
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl p-4 sm:p-6">
        <Outlet />
      </main>
    </div>
  )
}
