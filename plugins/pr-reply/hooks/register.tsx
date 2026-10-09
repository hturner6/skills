import type { Register } from 'claude-code'

const USAGE = [
  'Usage:',
  '  /pr-comments [pr]            list review comments on the PR (default: current branch)',
  '  /pr-reply <comment-id> <text>  reply in a review thread',
  '  /pr-reply general <text>       post a top-level PR comment',
].join('\n')

type Review = {
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

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'pr-comments',
      description: 'List review comments on the current PR',
      argumentHint: '[pr-number]',
    })
    await $.command.register({
      name: 'pr-reply',
      description: 'Reply to a PR review comment (or "general")',
      argumentHint: '<comment-id|general> <text>',
    })

    return next(e)
  })

  on('command.run', { command: 'pr-comments' }, async ($, e) => {
    try {
      const pr = await prNumber($, e.args.trim())
      const out = await gh($, ['api', '--paginate', '--slurp', `repos/{owner}/{repo}/pulls/${pr}/comments`])
      const rows = (JSON.parse(out) as Review[][]).flat()

      if (rows.length === 0) return { text: `PR #${pr}: no review comments.` }

      const lines = rows.map(c => {
        const where = c.line ? `${c.path}:${c.line}` : c.path
        const re = c.in_reply_to_id ? ` (reply to ${c.in_reply_to_id})` : ''
        const body = c.body.replace(/\s+/g, ' ').slice(0, 200)

        return `[${c.id}] ${c.user.login} @ ${where}${re}: ${body}`
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
}
