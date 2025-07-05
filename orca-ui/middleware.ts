import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

const BASIC_AUTH_USER = process.env.BASIC_AUTH_USER || ''
const BASIC_AUTH_PASS = process.env.BASIC_AUTH_PASS || ''
const WHITELIST = (process.env.IP_WHITELIST || '').split(',').filter(ip => ip.trim() !== '')

export function middleware(request: NextRequest) {
  console.log('🔐 Middleware running for:', request.url)
  const ip = request.headers.get('x-forwarded-for') || request.ip || ''
  console.log('📍 IP detected:', ip)
  console.log('📝 WHITELIST:', WHITELIST)
  console.log('👤 AUTH_USER:', BASIC_AUTH_USER)
  console.log('🔑 AUTH_PASS:', BASIC_AUTH_PASS ? '***' : 'empty')
  
  // Allow access if IP is whitelisted (only if whitelist is not empty)
  if (WHITELIST.length > 0 && WHITELIST.includes(ip)) {
    console.log('✅ IP whitelisted, allowing access')
    return NextResponse.next()
  }
  
  const authHeader = request.headers.get('authorization')
  if (!authHeader) {
    console.log('❌ No auth header, requiring authentication')
    return new Response('Unauthorized', {
      status: 401,
      headers: { 'WWW-Authenticate': 'Basic realm="Protected"' },
    })
  }
  
  const [scheme, encoded] = authHeader.split(' ')
  if (scheme !== 'Basic' || !encoded) {
    console.log('❌ Invalid auth scheme')
    return new Response('Unauthorized', { status: 401 })
  }
  
  const decoded = atob(encoded)
  const [user, pass] = decoded.split(':')
  
  if (user === BASIC_AUTH_USER && pass === BASIC_AUTH_PASS && BASIC_AUTH_USER !== '' && BASIC_AUTH_PASS !== '') {
    console.log('✅ Valid credentials, allowing access')
    return NextResponse.next()
  }
  
  console.log('❌ Invalid credentials')
  return new Response('Unauthorized', { status: 401 })
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|api).*)']
} 