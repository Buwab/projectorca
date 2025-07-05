'use client'

import { useEffect, useState } from 'react'

export default function AuthGuard({ children }: { children: React.ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [isChecking, setIsChecking] = useState(true)

  useEffect(() => {
    const checkAuth = async () => {
      try {
        const response = await fetch('/api/auth/check', {
          method: 'GET',
          headers: {
            'Cache-Control': 'no-cache',
          },
        })
        
        if (response.ok) {
          setIsAuthenticated(true)
        } else if (response.status === 401) {
          // Trigger browser basic auth dialog
          const authResponse = await fetch('/api/auth/check', {
            method: 'GET',
            headers: {
              'Cache-Control': 'no-cache',
            },
          })
          
          if (authResponse.ok) {
            setIsAuthenticated(true)
          } else {
            // Force browser to show basic auth dialog
            window.location.href = '/api/auth/login'
            return
          }
        }
      } catch (error) {
        console.error('Auth check failed:', error)
        window.location.href = '/api/auth/login'
        return
      }
      
      setIsChecking(false)
    }

    checkAuth()
  }, [])

  if (isChecking) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
      </div>
    )
  }

  if (!isAuthenticated) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-4">Access Restricted</h1>
          <p className="text-gray-600 mb-4">Please authenticate to continue</p>
          <button 
            onClick={() => window.location.href = '/api/auth/login'}
            className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded"
          >
            Login
          </button>
        </div>
      </div>
    )
  }

  return <>{children}</>
} 