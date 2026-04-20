import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function proxy(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  })

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
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()
  const { data: { session } } = await supabase.auth.getSession()

  const path = request.nextUrl.pathname

  const isAuthRoute = path.startsWith('/login') || path.startsWith('/callback')
  const isProtectedRoute =
    path.startsWith('/admin') ||
    path.startsWith('/organizer') ||
    path.startsWith('/runner')

  if (!user && isProtectedRoute) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  if (user || session) {
    const jwtRole = session?.access_token 
      ? JSON.parse(Buffer.from(session.access_token.split('.')[1], 'base64').toString()).app_metadata?.role 
      : null
    
    const role = 
      user?.user_metadata?.role || 
      user?.app_metadata?.role || 
      jwtRole || 
      'runner'

    if (path === '/') {
      if (role === 'admin') {
        return NextResponse.redirect(new URL('/admin', request.url))
      }
      if (role === 'organizer') {
        return NextResponse.redirect(new URL('/organizer', request.url))
      }
      return NextResponse.redirect(new URL('/runner', request.url))
    }

    if (path.startsWith('/admin') && role !== 'admin') {
      if (role === 'organizer') {
        return NextResponse.redirect(new URL('/organizer', request.url))
      }
      return NextResponse.redirect(new URL('/runner', request.url))
    }

    if (path.startsWith('/organizer') && role !== 'organizer' && role !== 'admin') {
      return NextResponse.redirect(new URL('/runner', request.url))
    }
  }

  if ((user || session) && isAuthRoute) {
    const jwtRole = session?.access_token 
      ? JSON.parse(Buffer.from(session.access_token.split('.')[1], 'base64').toString()).app_metadata?.role 
      : null
    
    const role = 
      user?.user_metadata?.role || 
      user?.app_metadata?.role || 
      jwtRole || 
      'runner'
    if (role === 'admin') {
      return NextResponse.redirect(new URL('/admin', request.url))
    }
    if (role === 'organizer') {
      return NextResponse.redirect(new URL('/organizer', request.url))
    }
    return NextResponse.redirect(new URL('/runner', request.url))
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|icons|manifest.json|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}