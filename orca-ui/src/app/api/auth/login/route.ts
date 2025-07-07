import { NextRequest } from 'next/server'
import { requireAuth } from '@/lib/auth'

export async function GET(request: NextRequest) {
  const authResult = requireAuth(request)
  
  if (authResult) {
    return authResult
  }
  
  // If authenticated, redirect to home
  return new Response(null, {
    status: 302,
    headers: {
      'Location': '/',
    },
  })
} 