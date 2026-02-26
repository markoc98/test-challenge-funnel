import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { Toaster } from 'sonner'

import { AuthProvider } from '@/auth/auth-provider'
import { AppLayout } from '@/components/app-layout'
import { AuthRedirect } from '@/components/auth-redirect'
import { ProtectedRoute } from '@/components/protected-route'
import { GalleryPage } from '@/pages/gallery-page'
import { LoginPage } from '@/pages/login-page'
import { SignUpPage } from '@/pages/sign-up-page'

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/sign-up" element={<SignUpPage />} />

          <Route element={<ProtectedRoute />}>
            <Route element={<AppLayout />}>
              <Route path="/gallery" element={<GalleryPage />} />
            </Route>
          </Route>

          <Route path="/" element={<AuthRedirect />} />
          <Route path="*" element={<AuthRedirect />} />
        </Routes>
        <Toaster position="top-right" richColors />
      </AuthProvider>
    </BrowserRouter>
  )
}

export default App
