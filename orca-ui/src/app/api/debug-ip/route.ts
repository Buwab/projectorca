import { NextRequest } from 'next/server'

export async function GET(request: NextRequest) {
  const forwardedFor = request.headers.get('x-forwarded-for') || ''
  const realIp = request.headers.get('x-real-ip') || ''
  const detectedIp = forwardedFor.split(',')[0]?.trim() || realIp || ''
  
  // Get all relevant headers
  const headers: Record<string, string> = {}
  request.headers.forEach((value, key) => {
    if (key.startsWith('x-') || key.includes('ip') || key.includes('forwarded')) {
      headers[key] = value
    }
  })
  
  return Response.json({
    message: "IP Detection Debug (No Auth Required) - Updated",
    detectedIp,
    forwardedFor,
    realIp,
    allRelevantHeaders: headers,
    timestamp: new Date().toISOString()
  })
} 