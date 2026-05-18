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

  if (pathname.startsWith('/organizer/')) {
    if (!user) {
      const loginUrl = new URL('/login', request.url)
      loginUrl.searchParams.set('redirect', pathname)
      return NextResponse.redirect(loginUrl)
    }

    const role =
      user?.app_metadata?.role || user?.user_metadata?.role || 'runner'

    if (role !== 'organizer' && role !== 'admin') {
      return new NextResponse('Forbidden', { status: 403 })
    }

    const { data: organizer } = await supabase
      .from('organizers')
      .select('is_active, sub_expires_at')
      .eq('user_id', user.id)
      .single()

    if (organizer) {
      if (!organizer.is_active) {
        return new NextResponse(
          'Your organizer account has been deactivated. Please contact support.',
          { status: 403 }
        )
      }

      if (
        organizer.sub_expires_at &&
        new Date(organizer.sub_expires_at) <= new Date()
      ) {
        return new NextResponse(
          'Your subscription has expired. Please renew to continue.',
          { status: 403 }
        )
      }
    }
  }

  return response
}

export const config = {
  matcher: ['/organizer/:path*'],
}
