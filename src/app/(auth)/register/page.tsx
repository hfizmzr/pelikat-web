'use client'

import { BrandLink } from '@/components/brand-mark'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { redirectAfterLogin } from '@/lib/auth/redirectAfterLogin'
import Link from 'next/link'
import { Input } from '@/components/ui/input'
import { PasswordInput } from '@/components/ui/password-input'

export default function RegisterPage() {
  const supabase = createClient()
  const router = useRouter()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setIsLoading(true)

    if (!email.trim()) {
      setError('Email is required')
      setIsLoading(false)
      return
    }

    if (!password) {
      setError('Password is required')
      setIsLoading(false)
      return
    }

    if (password.length < 8) {
      setError('Password must be at least 8 characters')
      setIsLoading(false)
      return
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match')
      setIsLoading(false)
      return
    }

    const { data, error: signUpError } = await supabase.auth.signUp({
      email: email.trim(),
      password,
    })

    if (signUpError) {
      setError(signUpError.message || 'Failed to create account')
      setIsLoading(false)
      return
    }

    if (!data?.user) {
      setError('Failed to create account. Please try again.')
      setIsLoading(false)
      return
    }

    // Auto-login after successful signup
    await redirectAfterLogin(data.user, router, supabase)
  }

  return (
    <>
      <div className="bg-card border border-border rounded-2xl p-8 ">
        <div className="w-full flex flex-col gap-6">
          {/* Logo */}
          <div className="text-center mb-2">
            <BrandLink className="mb-6" />
            <h1 className="text-2xl font-medium text-foreground">Create your account</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Join Pelikat as a runner or organizer
            </p>
          </div>

          {/* Error banner */}
          {error && (
            <div className="px-4 py-3 rounded-lg bg-destructive/10 border border-destructive/30 text-sm text-destructive text-center">
              {error}
            </div>
          )}

          {/* Registration form */}
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <label htmlFor="register-email" className="text-sm font-medium text-foreground">
                Email
              </label>
              <Input
                id="register-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
                disabled={isLoading}
              />
            </div>
            <div className="flex flex-col gap-2">
              <label htmlFor="register-password" className="text-sm font-medium text-foreground">
                Password
              </label>
              <PasswordInput
                id="register-password"
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="At least 8 characters"
                required
                disabled={isLoading}
              />
            </div>
            <div className="flex flex-col gap-2">
              <label htmlFor="register-confirm-password" className="text-sm font-medium text-foreground">
                Confirm password
              </label>
              <PasswordInput
                id="register-confirm-password"
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Re-enter your password"
                required
                disabled={isLoading}
              />
            </div>
            <button
              type="submit"
              disabled={isLoading}
              className="flex items-center justify-center gap-2 w-full px-4 py-2.5 rounded-lg bg-primary text-primary-foreground font-medium hover:bg-primary/90 transition-[color,background-color,border-color,opacity,transform] active:scale-[0.98] focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading ? (
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary-foreground" />
              ) : (
                'Create account'
              )}
            </button>
          </form>

          {/* Login link */}
          <p className="text-sm text-center text-muted-foreground">
            Already have an account?{' '}
            <Link href="/login" className="text-primary font-medium hover:underline underline-offset-2">
              Log in
            </Link>
          </p>

          <p className="text-xs text-muted-foreground text-center leading-relaxed">
            {/* Plain text until real Terms / Privacy pages exist (no dead links). */}
            By creating an account, you agree to our Terms and{' '}
            <span className="whitespace-nowrap">Privacy policy</span>.
          </p>
        </div>
      </div>
    </>
  )
}
