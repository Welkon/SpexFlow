export type User = {
  id: string
  email: string
}

export function authenticate(email: string, password: string): User | null {
  if (email === 'demo@example.com' && password === 'password') {
    return { id: 'u_demo', email }
  }
  return null
}

