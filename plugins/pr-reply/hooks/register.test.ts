import { expect, test } from 'claude-code/testing'

test('pr-comments with a bad argument shows usage', async $ => {
  const r = await $.command.run({ command: 'pr-comments', args: 'nonsense' })

  expect(r.text).toContain('Usage:')
})
