import { describe, expect, test } from 'claude-code/testing'

import { VERSION } from './version'

describe('VERSION', () => {
  test('está no formato x.y.z, como a do manifesto', () => {
    expect(VERSION).toMatch(/^\d+\.\d+\.\d+$/)
  })
})
