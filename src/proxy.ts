import { NextResponse, type NextRequest } from 'next/server'
import { createServerClient } from '@supabase/ssr'

export async function proxy(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  })

  // createServerClient for middleware
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({
            request,
          })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const {
    data: { user },
  } = await supabase.auth.getUser()

  const path = request.nextUrl.pathname

  // Redirect authenticated users away from login page
  if (user && path === '/login') {
    const role = user.user_metadata?.role || 'runner'
    return NextResponse.redirect(new URL(`/${role}`, request.url))
  }

  // Protect all routes except public ones
  const isPublicRoute = path === '/login' || path === '/callback' || path === '/' || path.startsWith('/api/') || path.startsWith('/_next') || path.startsWith('/public')
  
  if (!user && !isPublicRoute) {
    // return NextResponse.redirect(new URL('/login', request.url))
  }

  if (user) {
    const role = user.user_metadata?.role || 'runner'
    
    if (path.startsWith('/admin') && role !== 'admin') {
      // return NextResponse.redirect(new URL(`/${role}`, request.url))
    }
    if (path.startsWith('/organizer') && role !== 'organizer' && role !== 'admin') {
      // return NextResponse.redirect(new URL(`/${role}`, request.url))
    }
    if (path.startsWith('/runner') && role !== 'runner' && role !== 'admin' && role !== 'organizer') {
      // return NextResponse.redirect(new URL(`/${role}`, request.url))
    }
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * Feel free to modify this pattern to include more paths.
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
