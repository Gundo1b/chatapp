import { useState } from 'react'
import { supabase } from './lib/supabaseClient'

export default function AuthTest() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [message, setMessage] = useState('')

  const signUp = async () => {
    setMessage('')
    const { error } = await supabase.auth.signUp({ email, password })
    setMessage(error ? error.message : 'Signed up! Check your email if confirmation is on.')
  }

  const signIn = async () => {
    setMessage('')
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    setMessage(error ? error.message : 'Signed in!')
  }

  const signOut = async () => {
    await supabase.auth.signOut()
    setMessage('Signed out!')
  }

  return (
    <div style={{ maxWidth: 360 }}>
      <h2>Supabase Auth Test</h2>

      <input
        placeholder="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        style={{ width: '100%', marginBottom: 8 }}
      />
      <input
        placeholder="password"
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        style={{ width: '100%', marginBottom: 8 }}
      />

      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={signUp}>Sign up</button>
        <button onClick={signIn}>Sign in</button>
        <button onClick={signOut}>Sign out</button>
      </div>

      {message && <p>{message}</p>}
    </div>
  )
}
