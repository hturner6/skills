import { expect, test } from 'claude-code/testing'

const comments = [
  { id: 1, user: { login: 'rev' }, path: 'a.sh', line: 4, original_line: 4, original_commit_id: 'abc', body: 'fix\n```suggestion\nx\n```', diff_hunk: '@@ -1 +1 @@\n-old\n+new' },
  { id: 2, in_reply_to_id: 1, user: { login: 'me' }, path: 'a.sh', line: 4, body: 'done' },
]

const ok = (stdout: string) => ({ exitCode: 0, stdout, stderr: '', isStdoutTruncated: false, isStderrTruncated: false })

test('pane draws threads, suggestions and status', async ($, on) => {
  on('process.run', ($, e) => {
    const cmd = e.argv.join(' ')

    if (cmd.includes('graphql')) {
      return { value: ok(JSON.stringify({ data: { repository: { pullRequest: { id: 'P', reviewThreads: { nodes: [] }, reviews: { nodes: [] } } } } })) }
    }

    if (cmd.startsWith('gh api')) return { value: ok(JSON.stringify([comments])) }

    if (cmd.startsWith('git diff')) return { value: ok('@@ -4 +4 @@\n-if [ -z $name ]\n+x\n') }

    return { value: ok('') }
  })
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('store.get', () => ({ value: undefined }))
  on('store.set', () => ({ value: undefined }))
  on('model.complete', () => ({ value: { isAnswered: true, text: 'ADDRESSED: Fixed it.', usage: {} as never } }))

  await $.command.run({ command: 'pr-comments', args: '1' })

  const ui = await $.ui.mount({ plugin: 'pr-reply', surface: 'terminal', component: 'Pane', requestId: 'pr-reply', props: {}, viewport: { columns: 100, rows: 30 } })

  expect(await ui.find({ type: 'Text', text: /1 thread/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /Suggested change/ })).toBeDefined()
  expect(await ui.find({ key: 'queue' })).toBeDefined()
  await ui.press({ key: 'c1' })

  expect(await ui.find({ type: 'Text', text: /Diff/ })).toBeDefined()
  expect(await ui.find({ key: 'reply1' })).toBeDefined()
  await ui.unmount()
})
