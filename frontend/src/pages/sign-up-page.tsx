import { Navigate } from 'react-router-dom'
import { LoaderCircle } from 'lucide-react'

import { useAuth } from '@/auth/use-auth'
import { SignUpForm } from '@/components/sign-up-form'

export function SignUpPage() {
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
      <SignUpForm className="w-full max-w-sm" />
    </main>
  )
}
