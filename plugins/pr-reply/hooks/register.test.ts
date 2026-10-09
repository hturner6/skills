import { expect, test } from 'claude-code/testing'

test('pr-reply without a body shows usage', async $ => {
  const r = await $.command.run({ command: 'pr-reply', args: '123' })

  expect(r.text).toContain('Usage:')
})
