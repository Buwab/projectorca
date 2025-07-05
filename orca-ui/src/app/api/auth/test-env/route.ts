import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  return NextResponse.json({
    nodeEnv: process.env.NODE_ENV,
    vercelEnv: process.env.VERCEL_ENV,
    basicAuthUser: process.env.BASIC_AUTH_USER ? 'SET' : 'NOT SET',
    basicAuthPass: process.env.BASIC_AUTH_PASS ? 'SET' : 'NOT SET',
    ipWhitelist: process.env.IP_WHITELIST ? 'SET' : 'NOT SET',
    allEnvKeys: Object.keys(process.env).filter(key => key.startsWith('BASIC_') || key.startsWith('IP_')),
  })
} 