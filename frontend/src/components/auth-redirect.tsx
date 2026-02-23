import { Navigate } from 'react-router-dom'
import { LoaderCircle } from 'lucide-react'

import { useAuth } from '@/auth/use-auth'

export function AuthRedirect() {
  const { session, isLoading } = useAuth()

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <LoaderCircle className="size-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return <Navigate to={session ? '/gallery' : '/login'} replace />
}
