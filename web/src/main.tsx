import './zod-config.ts'
import { QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider } from '@tanstack/react-router'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { ToastProvider } from './components/ui/feedback.tsx'
import { TooltipProvider } from './components/ui/tooltip.tsx'
import { SignInAgain } from './features/auth/sign-in-again.tsx'
import { queryClient, router } from './router.tsx'
import './styles.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <ToastProvider>
          <RouterProvider router={router} />
          <SignInAgain />
        </ToastProvider>
      </TooltipProvider>
    </QueryClientProvider>
  </StrictMode>,
)
