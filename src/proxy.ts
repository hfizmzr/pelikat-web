import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function proxy(request: NextRequest) {
  let response = NextResponse.next()

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const {
    data: { user },
  } = await supabase.auth.getUser()

  const {
    data: { session },
  } = await supabase.auth.getSession()

  const path = request.nextUrl.pathname

  const isAuthRoute =
    path.startsWith('/login') ||
    path.startsWith('/callback')

  const isProtectedRoute =
    path.startsWith('/admin') ||
    path.startsWith('/organizer') ||
    path.startsWith('/runner')

  // Not logged in → block protected routes
  if (!user && !session && isProtectedRoute) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  // Logged in → determine role
  if (user) {
    const role =
      user.app_metadata?.role ||
      user.user_metadata?.role ||
      'runner'

    // Root redirect
    if (path === '/') {
      if (role === 'admin') {
        return NextResponse.redirect(new URL('/admin', request.url))
      }
      if (role === 'organizer') {
        return NextResponse.redirect(new URL('/organizer', request.url))
      }
      return NextResponse.redirect(new URL('/runner', request.url))
    }

    // 🔒 Role protection
    if (path.startsWith('/admin') && role !== 'admin') {
      return NextResponse.redirect(new URL('/runner', request.url))
    }

    if (
      path.startsWith('/organizer') &&
      role !== 'organizer' &&
      role !== 'admin'
    ) {
      return NextResponse.redirect(new URL('/runner', request.url))
    }

    // Prevent logged-in users from visiting login
    if (isAuthRoute) {
      if (role === 'admin') {
        return NextResponse.redirect(new URL('/admin', request.url))
      }
      if (role === 'organizer') {
        return NextResponse.redirect(new URL('/organizer', request.url))
      }
      return NextResponse.redirect(new URL('/runner', request.url))
    }
  }

  return response
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|icons|manifest.json|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}