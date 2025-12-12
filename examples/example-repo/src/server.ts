import { authenticate } from './auth'

export function handleLogin(body: { email: string; password: string }) {
  const user = authenticate(body.email, body.password)
  if (!user) {
    return { ok: false, error: 'invalid_credentials' as const }
  }
  return { ok: true, user }
}

