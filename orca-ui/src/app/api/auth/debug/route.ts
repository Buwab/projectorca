import { NextRequest } from 'next/server'
import { getClientIP, isIPWhitelisted, validateBasicAuth } from '@/lib/auth'

export async function GET(request: NextRequest) {
  // Get client IP
  const clientIP = getClientIP(request)
  
  // Check environment variables
  const basicAuthUser = process.env.BASIC_AUTH_USER || 'NOT SET'
  const basicAuthPass = process.env.BASIC_AUTH_PASS || 'NOT SET'
  const ipWhitelist = process.env.IP_WHITELIST || 'NOT SET'
  
  // Check auth status
  const authHeader = request.headers.get('authorization')
  const isValidAuth = validateBasicAuth(authHeader)
  const isWhitelisted = isIPWhitelisted(clientIP)
  
  // Parse whitelist for display
  const whitelistArray = ipWhitelist !== 'NOT SET' ? 
    ipWhitelist.split(',').map(ip => ip.trim()).filter(ip => ip !== '') : []
  
  return new Response(JSON.stringify({
    ip: {
      detected: clientIP,
      forwarded_for: request.headers.get('x-forwarded-for') || 'NOT SET',
      real_ip: request.headers.get('x-real-ip') || 'NOT SET',
      is_whitelisted: isWhitelisted
    },
    auth: {
      basic_auth_user: basicAuthUser !== 'NOT SET' ? '[SET]' : 'NOT SET',
      basic_auth_pass: basicAuthPass !== 'NOT SET' ? '[SET]' : 'NOT SET',
      is_valid_auth: isValidAuth,
      auth_header_present: !!authHeader
    },
    whitelist: {
      raw_value: ipWhitelist,
      parsed_ips: whitelistArray,
      count: whitelistArray.length
    },
    access: {
      would_allow: isWhitelisted || isValidAuth
    }
  }, null, 2), {
    headers: { 'Content-Type': 'application/json' }
  })
} 