import { NextRequest, NextResponse } from 'next/server'

const BASIC_AUTH_USER = process.env.BASIC_AUTH_USER || ''
const BASIC_AUTH_PASS = process.env.BASIC_AUTH_PASS || ''
const WHITELIST = (process.env.IP_WHITELIST || '').split(',').map(ip => ip.trim()).filter(ip => ip !== '')

export function getClientIP(request: NextRequest): string {
  const forwardedFor = request.headers.get('x-forwarded-for') || ''
  const realIp = request.headers.get('x-real-ip') || ''
  return forwardedFor.split(',')[0]?.trim() || realIp || ''
}

export function isIPWhitelisted(ip: string): boolean {
  return WHITELIST.length > 0 && WHITELIST.includes(ip)
}

export function validateBasicAuth(authHeader: string | null): boolean {
  if (!authHeader) return false
  
  const [scheme, encoded] = authHeader.split(' ')
  if (scheme !== 'Basic' || !encoded) return false
  
  try {
    const decoded = atob(encoded)
    const [user, pass] = decoded.split(':')
    return user === BASIC_AUTH_USER && pass === BASIC_AUTH_PASS && 
           BASIC_AUTH_USER !== '' && BASIC_AUTH_PASS !== ''
  } catch {
    return false
  }
}

export function requireAuth(request: NextRequest): NextResponse | null {
  const ip = getClientIP(request)
  
  // Temporarily disable IP whitelist for testing
  // if (isIPWhitelisted(ip)) {
  //   return null // Allow access
  // }
  
  // Require authentication
  const authHeader = request.headers.get('authorization')
  if (!validateBasicAuth(authHeader)) {
    return new NextResponse('Unauthorized', {
      status: 401,
      headers: { 'WWW-Authenticate': 'Basic realm="Protected"' },
    })
  }
  
  return null // Allow access
}

// Server-side auth for API routes
export function withAuth(
  handler: (request: NextRequest, context?: { params?: Record<string, string> }) => Promise<Response> | Response
) {
  return async (request: NextRequest, context?: { params?: Record<string, string> }): Promise<Response> => {
    const authResult = requireAuth(request)
    
    if (authResult) {
      return authResult
    }
    
    return handler(request, context)
  }
} 