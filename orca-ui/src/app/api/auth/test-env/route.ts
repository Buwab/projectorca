import { NextResponse } from 'next/server'

export async function GET() {
  return NextResponse.json({
    nodeEnv: process.env.NODE_ENV,
    vercelEnv: process.env.VERCEL_ENV,
    basicAuthUser: process.env.BASIC_AUTH_USER ? 'SET' : 'NOT SET',
    basicAuthPass: process.env.BASIC_AUTH_PASS ? 'SET' : 'NOT SET',
    ipWhitelist: process.env.IP_WHITELIST ? 'SET' : 'NOT SET',
    // More detailed debugging
    basicAuthUserValue: process.env.BASIC_AUTH_USER || 'undefined',
    basicAuthPassValue: process.env.BASIC_AUTH_PASS || 'undefined',
    ipWhitelistValue: process.env.IP_WHITELIST || 'undefined',
    allEnvKeys: Object.keys(process.env).filter(key => key.startsWith('BASIC_') || key.startsWith('IP_')),
    allKeys: Object.keys(process.env).sort(),
  })
} 