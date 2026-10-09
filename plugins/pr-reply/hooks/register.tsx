import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

import type { Board, Comment } from '../types'

const PANE = 'pr-reply'
const board = atom({ plugin: 'pr-reply', key: 'board' } as const, { pr: '', items: [], error: '' } as Board)
const selected = atom({ plugin: 'pr-reply', key: 'selected' } as const, null as number | null)
const status = atom({ plugin: 'pr-reply', key: 'status' } as const, '')

const USAGE = [
  'Usage:',
  '  /pr-comments [pr]              open the comments pane (default: current branch PR)',
  '  /pr-comments list [pr]         print review comments as text',
  '  /pr-reply <comment-id> <text>  reply in a review thread',
  '  /pr-reply general <text>       post a top-level PR comment',
].join('\n')

type Raw = {
  id: number
  in_reply_to_id?: number
  user: { login: string }
  path: string
  line?: number | null
  body: string
}

async function gh($: any, argv: string[], stdin?: string): Promise<string> {
  const r = await $.process.run(['gh', ...argv], { stdin, timeoutMs: 60_000 })

  if (r.exitCode !== 0) throw new Error((r.stderr || r.stdout).trim() || `gh exited ${r.exitCode}`)

  return r.stdout as string
}

async function prNumber($: any, given: string): Promise<string> {
  if (/^\d+$/.test(given)) return given

  return (await gh($, ['pr', 'view', '--json', 'number', '--jq', '.number'])).trim()
}

async function fetchComments($: any, pr: string): Promise<Comment[]> {
  const out = await gh($, ['api', '--paginate', '--slurp', `repos/{owner}/{repo}/pulls/${pr}/comments`])

  return (JSON.parse(out) as Raw[][]).flat().map(c => ({
    id: c.id,
    parent: c.in_reply_to_id ?? null,
    author: c.user.login,
    path: c.path,
    line: c.line ?? null,
    body: c.body,
  }))
}

async function load($: any, given: string): Promise<void> {
  await update($, status, () => 'Loading…')

  try {
    const pr = await prNumber($, given)
    const items = await fetchComments($, pr)
    await update($, board, () => ({ pr, items, error: '' }))
    await update($, status, () => '')
  } catch (err) {
    await update($, board, b => ({ ...b, error: (err as Error).message }))
    await update($, status, () => '')
  }
}

async function sendReply($: any, pr: string, id: number, text: string): Promise<void> {
  const body = text.trim()

  if (!body) return

  await update($, status, () => 'Posting…')

  try {
    await gh($, ['api', '-X', 'POST', `repos/{owner}/{repo}/pulls/${pr}/comments/${id}/replies`, '-F', 'body=@-'], body)
    $.ui.toast(`Replied on PR #${pr}`)
    await update($, selected, () => null)
    await load($, pr)
  } catch (err) {
    await update($, status, () => `Failed: ${(err as Error).message}`)
  }
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'pr-comments',
      description: 'Open the PR comments pane',
      argumentHint: '[list] [pr-number]',
    })
    await $.command.register({
      name: 'pr-reply',
      description: 'Reply to a PR review comment (or "general")',
      argumentHint: '<comment-id|general> <text>',
    })

    return next(e)
  })

  on('command.run', { command: 'pr-comments' }, async ($, e) => {
    const m = e.args.trim().match(/^(list\s*)?(\d*)$/)

    if (!m) return { text: USAGE }

    if (!m[1]) {
      await $.ui.open({ id: PANE, title: 'PR comments', focus: true })
      await update($, selected, () => null)
      void load($, m[2])

      return { text: 'PR comments pane opened.' }
    }

    try {
      const pr = await prNumber($, m[2])
      const rows = await fetchComments($, pr)

      if (rows.length === 0) return { text: `PR #${pr}: no review comments.` }

      const lines = rows.map(c => {
        const where = c.line ? `${c.path}:${c.line}` : c.path
        const re = c.parent ? ` (reply to ${c.parent})` : ''

        return `[${c.id}] ${c.author} @ ${where}${re}: ${c.body.replace(/\s+/g, ' ').slice(0, 200)}`
      })

      return { text: `PR #${pr} review comments:\n${lines.join('\n')}\n\nReply with /pr-reply <id> <text>` }
    } catch (err) {
      return { text: `pr-comments failed: ${(err as Error).message}` }
    }
  })

  on('command.run', { command: 'pr-reply' }, async ($, e) => {
    const m = e.args.trim().match(/^(\S+)\s+([\s\S]+)$/)

    if (!m) return { text: USAGE }

    const [, target, body] = m

    try {
      const pr = await prNumber($, '')

      if (target === 'general') {
        await gh($, ['pr', 'comment', pr, '--body-file', '-'], body)

        return { text: `Posted comment on PR #${pr}.` }
      }

      if (!/^\d+$/.test(target)) return { text: USAGE }

      const out = await gh(
        $,
        ['api', '-X', 'POST', `repos/{owner}/{repo}/pulls/${pr}/comments/${target}/replies`, '-F', 'body=@-'],
        body,
      )
      const url = (JSON.parse(out) as { html_url?: string }).html_url

      return { text: `Replied to comment ${target} on PR #${pr}${url ? `: ${url}` : '.'}` }
    } catch (err) {
      return { text: `pr-reply failed: ${(err as Error).message}` }
    }
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text, Button, Input } = $.ui.resolve(e)
    const { pr, items, error } = await read($, board)
    const sel = await read($, selected)
    const msg = await read($, status)
    const roots = items.filter(c => c.parent === null)
    const room = Math.max(3, Math.floor(((e.viewport?.rows ?? 24) - 6) / 3))

    return (
      <Box flexDirection="column">
        <Text bold>PR #{pr || '?'} review threads</Text>
        {error !== '' && <Text color="red">{error}</Text>}
        {error === '' && roots.length === 0 && <Text dimColor>No review comments.</Text>}
        {roots.slice(0, room).map(c => {
          const replies = items.filter(r => r.parent === c.id)
          const isSel = sel === c.id

          return (
            <Box flexDirection="column" key={`t${c.id}`}>
              <Button key={`c${c.id}`} onPress={() => update($, selected, () => (isSel ? null : c.id))}>
                <Text bold={isSel}>
                  {isSel ? '▶ ' : '  '}[{c.id}] {c.author} {c.path}
                  {c.line ? `:${c.line}` : ''}
                </Text>
              </Button>
              <Text>    {c.body.replace(/\s+/g, ' ').slice(0, 160)}</Text>
              {replies.map(r => (
                <Text dimColor>      ↳ {r.author}: {r.body.replace(/\s+/g, ' ').slice(0, 140)}</Text>
              ))}
              {isSel && (
                <Input
                  key={`reply${c.id}`}
                  label="Reply: "
                  placeholder="type a reply"
                  submitLabel="send"
                  autoFocus
                  onSubmit={text => sendReply($, pr, c.id, text)}
                />
              )}
            </Box>
          )
        })}
        {roots.length > room && <Text dimColor>…{roots.length - room} more threads</Text>}
        {msg !== '' && <Text color="yellow">{msg}</Text>}
        <Button key="refresh" label="Refresh" onPress={() => load($, pr)} />
      </Box>
    )
  })
}
