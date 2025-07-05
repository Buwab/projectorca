import { NextRequest } from 'next/server'
import { requireAuth } from '@/lib/auth'

export async function GET(request: NextRequest) {
  const authResult = requireAuth(request)
  
  if (authResult) {
    return authResult
  }
  
  return new Response('✅ Authentication successful! You are authorized.', { 
    status: 200,
    headers: { 'Content-Type': 'text/plain' }
  })
} 