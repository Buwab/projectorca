import { NextRequest } from 'next/server'
import { getClientIP } from '@/lib/auth'

export async function GET(request: NextRequest) {
  const forwardedFor = request.headers.get('x-forwarded-for') || ''
  const realIp = request.headers.get('x-real-ip') || ''
  const detectedIp = getClientIP(request)
  
  const WHITELIST = (process.env.IP_WHITELIST || '').split(',').filter(ip => ip.trim() !== '')
  
  return Response.json({
    detectedIp,
    forwardedFor,
    realIp,
    whitelist: WHITELIST,
    isWhitelisted: WHITELIST.length > 0 && WHITELIST.includes(detectedIp),
    authUser: process.env.BASIC_AUTH_USER ? 'SET' : 'NOT SET',
    authPass: process.env.BASIC_AUTH_PASS ? 'SET' : 'NOT SET',
    headers: {
      'x-forwarded-for': forwardedFor,
      'x-real-ip': realIp,
      'x-forwarded-proto': request.headers.get('x-forwarded-proto'),
      'x-vercel-ip-country': request.headers.get('x-vercel-ip-country'),
      'x-vercel-ip-city': request.headers.get('x-vercel-ip-city'),
    }
  })
} 