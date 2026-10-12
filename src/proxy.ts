import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import type { NextRequest } from 'next/server'

export async function proxy(request: NextRequest) {
  const response = NextResponse.next()

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => {
            request.cookies.set(name, value)
          })
          cookiesToSet.forEach(({ name, value, options }) => {
            response.cookies.set(name, value, options)
          })
        },
      },
    }
  )

  const {
    data: { user },
  } = await supabase.auth.getUser()

  const pathname = request.nextUrl.pathname

  // Bare paths (/admin, /runner, /organizer) must be covered too —
  // startsWith('/x/') alone misses them.
  const inAdmin = pathname === '/admin' || pathname.startsWith('/admin/')
  const inRunner = pathname === '/runner' || pathname.startsWith('/runner/')
  const inOrganizer = pathname === '/organizer' || pathname.startsWith('/organizer/')

  // Protect admin routes
  if (inAdmin) {
    if (!user) {
      const loginUrl = new URL('/login', request.url)
      loginUrl.searchParams.set('redirect', pathname)
      return NextResponse.redirect(loginUrl)
    }
    // Layout-level role checks are defense-in-depth; the wall belongs here.
    if (user.app_metadata?.role !== 'admin') {
      return NextResponse.redirect(new URL('/', request.url))
    }
    return response
  }

  // Protect runner routes
  if (inRunner) {
    if (!user) {
      const loginUrl = new URL('/login', request.url)
      loginUrl.searchParams.set('redirect', pathname)
      return NextResponse.redirect(loginUrl)
    }

    // Profile completion gate (UC10): block runner routes until the
    // profile is complete. Always allow the profile page itself.
    if (pathname !== '/runner/profile') {
      const { data: profile } = await supabase
        .from('runner_profiles')
        .select('full_name, dob, gender, phone, pdpa_agreed, ic_encrypted')
        .eq('user_id', user.id)
        .maybeSingle()

      const complete =
        !!profile &&
        !!profile.full_name &&
        !!profile.dob &&
        !!profile.gender &&
        !!profile.phone &&
        !!profile.pdpa_agreed &&
        !!profile.ic_encrypted

      if (!complete) {
        return NextResponse.redirect(new URL('/runner/profile', request.url))
      }
    }

    return response
  }

  // Protect organizer routes
  if (inOrganizer) {
    // Allow unauthenticated access to the public apply pages
    if (pathname.startsWith('/organizer/apply')) {
      return response
    }

    if (!user) {
      const loginUrl = new URL('/login', request.url)
      loginUrl.searchParams.set('redirect', pathname)
      return NextResponse.redirect(loginUrl)
    }

    const subscriptionExpiredPath = '/organizer/subscription-expired'
    const paymentPath = '/organizer/payment'

    // Always allow access to special pages
    if (pathname.startsWith(subscriptionExpiredPath) || pathname.startsWith(paymentPath)) {
      return response
    }

    // SOURCE OF TRUTH: DATABASE (NOT JWT)
    const { data: organizer, error } = await supabase
      .from('organizers')
      .select('is_active, sub_expires_at')
      .eq('contact_email', user.email)
      .maybeSingle()

    if (error || !organizer) {
      return new NextResponse('Forbidden: Organizer not found', {
        status: 403,
      })
    }

    if (!organizer.is_active) {
      return NextResponse.redirect(new URL(subscriptionExpiredPath, request.url))
    }

    // Redirect to payment page if subscription has never been set up
    if (!organizer.sub_expires_at) {
      return NextResponse.redirect(new URL(paymentPath, request.url))
    }

    // Redirect to expired page if subscription has expired
    if (new Date(organizer.sub_expires_at) <= new Date()) {
      return NextResponse.redirect(new URL(subscriptionExpiredPath, request.url))
    }
  }

  return response
}

export const config = {
  matcher: ['/organizer/:path*', '/admin/:path*', '/runner/:path*'],
}