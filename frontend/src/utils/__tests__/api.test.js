import { describe, it, expect } from 'vitest'

describe('API client', () => {
  it('can be imported', async () => {
    // Smoke test: ensure api/client.js loads without errors
    const api = await import('../../api/client.js')
    expect(api).toBeDefined()
    expect(api.default).toBeDefined()
  })

  it('has a create method (axios)', async () => {
    const api = await import('../../api/client.js')
    expect(api.default.get).toBeDefined()
    expect(api.default.post).toBeDefined()
  })
})
