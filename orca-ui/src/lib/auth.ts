import { NextRequest, NextResponse } from 'next/server'

export function getClientIP(request: NextRequest): string {
  const forwardedFor = request.headers.get('x-forwarded-for') || ''
  const realIp = request.headers.get('x-real-ip') || ''
  return forwardedFor.split(',')[0]?.trim() || realIp || ''
}

export function isIPWhitelisted(ip: string): boolean {
  const whitelist = (process.env.IP_WHITELIST || '').split(',').map(ip => ip.trim()).filter(ip => ip !== '')
  return whitelist.length > 0 && whitelist.includes(ip)
}

export function validateBasicAuth(authHeader: string | null): boolean {
  if (!authHeader) return false
  
  const [scheme, encoded] = authHeader.split(' ')
  if (scheme !== 'Basic' || !encoded) return false
  
  try {
    const decoded = atob(encoded)
    const [user, pass] = decoded.split(':')
    const basicAuthUser = process.env.BASIC_AUTH_USER || ''
    const basicAuthPass = process.env.BASIC_AUTH_PASS || ''
    return user === basicAuthUser && pass === basicAuthPass && 
           basicAuthUser !== '' && basicAuthPass !== ''
  } catch {
    return false
  }
}

export function requireAuth(request: NextRequest): NextResponse | null {
  // Require authentication (IP whitelist temporarily disabled)
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