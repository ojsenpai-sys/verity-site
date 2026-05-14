'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from 'react'
import type { User } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/client'

type AuthCtx = {
  user:    User | null
  loading: boolean
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthCtx>({
  user:    null,
  loading: true,
  signOut: async () => {},
})

export function AuthProvider({
  children,
  initialUser,
}: {
  children:    React.ReactNode
  initialUser: User | null
}) {
  const [user, setUser]       = useState<User | null>(initialUser)
  const [loading, setLoading] = useState(false)
  const supabase              = createClient()

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setUser(session?.user ?? null)
        setLoading(false)
      }
    )
    return () => subscription.unsubscribe()
  }, [supabase])

  const signOut = useCallback(async () => {
    await supabase.auth.signOut()
    window.location.href = '/verity/login'
  }, [supabase])

  return (
    <AuthContext.Provider value={{ user, loading, signOut }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
