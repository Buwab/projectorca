import { NextRequest } from 'next/server'
import { validateBasicAuth } from '@/lib/auth'

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  const isValid = validateBasicAuth(authHeader)
  
  let decodedCreds = null
  if (authHeader) {
    const [scheme, encoded] = authHeader.split(' ')
    if (scheme === 'Basic' && encoded) {
      try {
        const decoded = atob(encoded)
        const [user, pass] = decoded.split(':')
        decodedCreds = { user, pass: pass ? '***' : 'empty' }
      } catch {
        decodedCreds = { error: 'Failed to decode' }
      }
    }
  }
  
  return Response.json({
    hasAuthHeader: !!authHeader,
    authHeader: authHeader ? authHeader.substring(0, 20) + '...' : null,
    decodedCreds,
    isValid,
    expectedUser: process.env.BASIC_AUTH_USER || 'NOT SET',
    expectedPass: process.env.BASIC_AUTH_PASS ? 'SET' : 'NOT SET',
    envVarsMatch: {
      user: decodedCreds?.user === process.env.BASIC_AUTH_USER,
      pass: !!process.env.BASIC_AUTH_PASS
    }
  })
} 