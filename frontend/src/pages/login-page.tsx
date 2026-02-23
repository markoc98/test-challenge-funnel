import { Navigate } from 'react-router-dom'
import { LoaderCircle } from 'lucide-react'

import { useAuth } from '@/auth/use-auth'
import { LoginForm } from '@/components/login-form'

export function LoginPage() {
  const { session, isLoading } = useAuth()

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <LoaderCircle className="size-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (session) {
    return <Navigate to="/gallery" replace />
  }

  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <LoginForm className="w-full max-w-sm" />
    </main>
  )
}
