import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

import type { Board, Comment, Progress } from '../types'

let resolveOnSubmit = false

const PANE = 'pr-reply'
const board = atom({ plugin: 'pr-reply', key: 'board' } as const, { pr: '', items: [], error: '' } as Board)
const selected = atom({ plugin: 'pr-reply', key: 'selected' } as const, null as number | null)
const status = atom({ plugin: 'pr-reply', key: 'status' } as const, '')
const draft = atom({ plugin: 'pr-reply', key: 'draft' } as const, '')
const suggestion = atom({ plugin: 'pr-reply', key: 'suggestion' } as const, { id: null as number | null, text: '' })
const progress = atom({ plugin: 'pr-reply', key: 'progress' } as const, {} as Record<number, Progress>)
const pending = atom({ plugin: 'pr-reply', key: 'pending' } as const, 0)

const USAGE = [
  'Usage:',
  '  /pr-comments [pr]       open the comments pane (default: current branch PR)',
  '  /pr-comments list [pr]  print review comments as text',
].join('\n')

type Raw = {
  id: number
  in_reply_to_id?: number
  user: { login: string }
  path: string
  line?: number | null
  body: string
  diff_hunk?: string
  original_commit_id?: string
  original_line?: number | null
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
    diffHunk: c.diff_hunk ?? '',
    commitId: c.original_commit_id ?? '',
    originalLine: c.original_line ?? null,
  }))
}

async function load($: any, given: string): Promise<void> {
  await update($, status, () => 'Loading…')

  try {
    const pr = await prNumber($, given)
    const items = await fetchComments($, pr)
    await update($, board, () => ({ pr, items, error: '' }))
    await update($, status, () => '')
    const info = await reviewInfo($, pr)
    await update($, pending, () => info.pendingCount)
    await refreshProgress($, pr, items)
  } catch (err) {
    await update($, board, b => ({ ...b, error: (err as Error).message }))
    await update($, status, () => '')
  }
}

const INFO_QUERY = `query($owner: String!, $name: String!, $number: Int!) {
  repository(owner: $owner, name: $name) {
    pullRequest(number: $number) {
      id
      reviewThreads(first: 100) { nodes { id comments(first: 1) { nodes { databaseId } } } }
      reviews(states: PENDING, first: 20) { nodes { id viewerDidAuthor comments { totalCount } } }
    }
  }
}`

type ReviewInfo = { prId: string; threads: Map<number, string>; reviewId: string | null; pendingCount: number }

async function gql($: any, query: string, vars: string[], stdin?: string): Promise<any> {
  const args = ['api', 'graphql', '-f', `query=${query}`]

  for (const v of vars) args.push('-F', v)

  return JSON.parse(await gh($, args, stdin)).data
}

async function reviewInfo($: any, pr: string): Promise<ReviewInfo> {
  const data = await gql($, INFO_QUERY, ['owner={owner}', 'name={repo}', `number=${pr}`])
  const node = data.repository.pullRequest
  const threads = new Map<number, string>()

  for (const t of node.reviewThreads.nodes) {
    const root = t.comments.nodes[0]

    if (root) threads.set(root.databaseId, t.id)
  }

  const mine = (node.reviews.nodes as { id: string; viewerDidAuthor: boolean; comments: { totalCount: number } }[]).find(
    r => r.viewerDidAuthor,
  )

  return { prId: node.id, threads, reviewId: mine?.id ?? null, pendingCount: mine?.comments.totalCount ?? 0 }
}

async function addReplies($: any, pr: string, replies: { id: number; body: string }[]): Promise<void> {
  const info = await reviewInfo($, pr)
  let reviewId = info.reviewId

  if (!reviewId) {
    const made = await gql(
      $,
      'mutation($pr: ID!) { addPullRequestReview(input: {pullRequestId: $pr}) { pullRequestReview { id } } }',
      [`pr=${info.prId}`],
    )
    reviewId = made.addPullRequestReview.pullRequestReview.id as string
  }

  for (const r of replies) {
    const thread = info.threads.get(r.id)

    if (!thread) throw new Error(`thread for comment ${r.id} not found`)

    await gql(
      $,
      'mutation($review: ID!, $thread: ID!, $body: String!) { addPullRequestReviewThreadReply(input: {pullRequestReviewId: $review, pullRequestReviewThreadId: $thread, body: $body}) { comment { id } } }',
      [`review=${reviewId}`, `thread=${thread}`, 'body=@-'],
      r.body,
    )
    await update($, progress, p => ({
      ...p,
      [r.id]: { state: p[r.id]?.state ?? 'open', note: p[r.id]?.note ?? '', sig: p[r.id]?.sig ?? '', queued: true },
    }))
  }

  await saveProgress($, pr)
}

async function sendReply($: any, pr: string, id: number, text: string): Promise<void> {
  const body = text.trim()

  if (!body) return

  await update($, status, () => 'Adding to pending review…')

  try {
    await addReplies($, pr, [{ id, body }])
    $.ui.toast('Reply added to pending review')
    await update($, selected, () => null)
    await update($, draft, () => '')
    await load($, pr)
  } catch (err) {
    await update($, status, () => `Failed: ${(err as Error).message}`)
  }
}

async function queueAddressed($: any, pr: string): Promise<void> {
  const prog = await read($, progress)
  const todo = Object.entries(prog)
    .filter(([, v]) => v.state === 'addressed' && !v.queued && v.note)
    .map(([k, v]) => ({ id: Number(k), body: v.note }))

  if (todo.length === 0) return

  await update($, status, () => `Queuing ${todo.length} replies…`)

  try {
    await addReplies($, pr, todo)
    $.ui.toast(`${todo.length} replies added to pending review`)
    await load($, pr)
  } catch (err) {
    await update($, status, () => `Failed: ${(err as Error).message}`)
  }
}

async function finishReview($: any, pr: string, isSubmit: boolean): Promise<void> {
  await update($, status, () => (isSubmit ? 'Submitting review…' : 'Discarding…'))

  try {
    const info = await reviewInfo($, pr)

    if (!info.reviewId) throw new Error('no pending review')

    if (isSubmit) {
      await gql(
        $,
        'mutation($review: ID!) { submitPullRequestReview(input: {pullRequestReviewId: $review, event: COMMENT}) { pullRequestReview { id } } }',
        [`review=${info.reviewId}`],
      )
      if (resolveOnSubmit) {
        const prog = await read($, progress)

        for (const [k, v] of Object.entries(prog)) {
          const thread = info.threads.get(Number(k))

          if (v.queued && v.state === 'addressed' && thread) {
            await gql($, 'mutation($t: ID!) { resolveReviewThread(input: {threadId: $t}) { thread { id } } }', [`t=${thread}`])
          }
        }
      }

      $.ui.toast(`Review submitted on PR #${pr}`)
    } else {
      await gql(
        $,
        'mutation($review: ID!) { deletePullRequestReview(input: {pullRequestReviewId: $review}) { pullRequestReview { id } } }',
        [`review=${info.reviewId}`],
      )
      await update($, progress, p => Object.fromEntries(Object.entries(p).map(([k, v]) => [k, { ...v, queued: false }])))
      await saveProgress($, pr)
      $.ui.toast('Pending review discarded')
    }

    await load($, pr)
  } catch (err) {
    await update($, status, () => `Failed: ${(err as Error).message}`)
  }
}

type Hunk = { oldStart: number; oldCount: number; text: string }

function parseHunks(diff: string): Hunk[] {
  const out: Hunk[] = []

  for (const part of diff.split(/^(?=@@ )/m)) {
    const m = part.match(/^@@ -(\d+)(?:,(\d+))? \+\d+(?:,\d+)? @@/)

    if (m) out.push({ oldStart: Number(m[1]), oldCount: m[2] === undefined ? 1 : Number(m[2]), text: part })
  }

  return out
}

function hashOf(text: string): string {
  let h = 5381

  for (let i = 0; i < text.length; i++) h = ((h * 33) ^ text.charCodeAt(i)) >>> 0

  return h.toString(36)
}

async function saveProgress($: any, pr: string): Promise<void> {
  await $.store.set(`progress:${pr}`, await read($, progress))
}

async function judge($: any, c: Comment, hunk: string): Promise<{ state: 'addressed' | 'changed'; note: string }> {
  const added = hunk.split('\n').filter(l => l.startsWith('+')).map(l => l.slice(1).trim())
  const wanted = splitBody(c.body).filter(x => x.suggestion).flatMap(x => x.text.split('\n').map(l => l.trim()).filter(Boolean))

  if (wanted.length > 0 && wanted.every(l => added.includes(l))) return { state: 'addressed', note: 'Applied the suggested change.' }

  const r = await $.model.complete({
    model: 'haiku',
    effort: 'low',
    maxTokens: 120,
    timeoutMs: 20_000,
    prompt: [
      'A reviewer left this comment on a pull request. The code author has since changed the code (diff below).',
      'Decide if the change addresses the comment. Answer exactly one line: ADDRESSED: <reply>, PARTIAL: <what is missing>, or NO: <why>.',
      'For ADDRESSED the reply is written by the author to the reviewer: max 15 words, past tense, plain text, no quotes.',
      `File: ${c.path}`,
      `Comment by ${c.author}:\n${c.body}`,
      `Diff since the comment was made:\n${hunk.slice(0, 3000)}`,
    ].join('\n\n'),
  })
  const m = r.isAnswered ? r.text.trim().match(/^(ADDRESSED|PARTIAL|NO)\W*(.*)$/is) : null

  if (m && m[1].toUpperCase() === 'ADDRESSED' && m[2].trim()) return { state: 'addressed', note: m[2].trim().split('\n')[0] }

  return { state: 'changed', note: m ? m[2].trim().split('\n')[0] : '' }
}

async function refreshProgress($: any, pr: string, items: Comment[]): Promise<void> {
  const stored = ((await $.store.get(`progress:${pr}`)) ?? {}) as Record<number, Progress>
  await update($, progress, () => stored)

  for (const c of items.filter(x => x.parent === null && x.commitId)) {
    try {
      const diff = await $.process.run(['git', 'diff', '-U0', c.commitId, '--', c.path])

      if (diff.exitCode !== 0) continue

      const line = c.originalLine ?? c.line ?? 0
      const near = parseHunks(diff.stdout as string).filter(
        h => h.oldStart <= line + 3 && h.oldStart + Math.max(h.oldCount, 1) - 1 >= line - 3,
      )
      const prev = stored[c.id]

      if (near.length === 0) {
        if (prev && prev.state !== 'open') await update($, progress, p => ({ ...p, [c.id]: { state: 'open', note: '', sig: '', queued: prev.queued } }))

        continue
      }

      const text = near.map(h => h.text).join('\n')
      const sig = hashOf(text)

      if (prev && prev.sig === sig) continue

      await update($, progress, p => ({ ...p, [c.id]: { state: 'changed', note: '', sig, queued: prev?.queued ?? false } }))

      const verdict = await judge($, c, text)
      const log = await $.process.run(['git', 'log', '-1', '--format=%h', `${c.commitId}..HEAD`, '--', c.path])
      const sha = log.exitCode === 0 ? (log.stdout as string).trim() : ''
      const note = verdict.state === 'addressed' && sha ? `${verdict.note} (${sha})` : verdict.note

      await update($, progress, p => ({ ...p, [c.id]: { state: verdict.state, note, sig, queued: prev?.queued ?? false } }))
    } catch {
      // leave this thread's status as it was
    }
  }

  await saveProgress($, pr)
}

function quickReply(c: Comment): string {
  return /```suggestion/.test(c.body) ? 'Good catch, applied.' : 'Thanks, will fix.'
}

async function pickThread($: any, c: Comment, isOpen: boolean): Promise<void> {
  await update($, draft, () => '')

  if (isOpen) {
    await update($, selected, () => null)
    await update($, suggestion, () => ({ id: null, text: '' }))

    return
  }

  await update($, selected, () => c.id)

  const known = (await read($, progress))[c.id]

  if (known && known.state === 'addressed' && known.note) {
    await update($, suggestion, () => ({ id: c.id, text: known.note }))

    return
  }

  await update($, suggestion, () => ({ id: c.id, text: quickReply(c) }))

  const hunk = c.diffHunk.split('\n').slice(-12).join('\n')
  const r = await $.model.complete({
    model: 'haiku',
    effort: 'low',
    maxTokens: 120,
    timeoutMs: 15_000,
    prompt: [
      'Write ONE short reply (max 20 words) from the code author to this GitHub pull request review comment.',
      'First person, plain text, no quotes, no markdown. Acknowledge and say you will address it, or answer briefly if it is a question you can answer from the code shown.',
      `File: ${c.path}`,
      `Code:\n${hunk}`,
      `Comment by ${c.author}:\n${c.body}`,
    ].join('\n\n'),
  })
  const text = r.isAnswered ? r.text.trim().replace(/^["']|["']$/g, '').split('\n')[0] : ''

  if (text) await update($, suggestion, s => (s.id === c.id ? { id: c.id, text } : s))
}

async function acceptSuggestion($: any): Promise<void> {
  const s = await read($, suggestion)

  await update($, draft, () => s.text)
}

function groupByFile(roots: Comment[]): { path: string; threads: Comment[] }[] {
  const out: { path: string; threads: Comment[] }[] = []

  for (const c of roots) {
    const hit = out.find(f => f.path === c.path)

    if (hit) hit.threads.push(c)
    else out.push({ path: c.path, threads: [c] })
  }

  return out
}

function splitBody(text: string): { text: string; suggestion: boolean }[] {
  const out: { text: string; suggestion: boolean }[] = []
  const re = /```suggestion[^\n]*\n([\s\S]*?)```/g
  let last = 0
  let m: RegExpExecArray | null

  while ((m = re.exec(text)) !== null) {
    const before = text.slice(last, m.index).trim()

    if (before) out.push({ text: before, suggestion: false })

    out.push({ text: m[1].replace(/\n$/, ''), suggestion: true })
    last = m.index + m[0].length
  }

  const rest = text.slice(last).trim()

  if (rest) out.push({ text: rest, suggestion: false })

  return out
}

async function sendGeneral($: any, pr: string, text: string): Promise<void> {
  const body = text.trim()

  if (!body) return

  await update($, status, () => 'Posting…')

  try {
    await gh($, ['pr', 'comment', pr, '--body-file', '-'], body)
    $.ui.toast(`Commented on PR #${pr}`)
    await update($, status, () => '')
  } catch (err) {
    await update($, status, () => `Failed: ${(err as Error).message}`)
  }
}

export const register: Register = (on, options) => {
  resolveOnSubmit = (options as { resolveOnSubmit?: boolean } | undefined)?.resolveOnSubmit === true

  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'pr-comments',
      description: 'Open the PR comments pane',
      argumentHint: '[list] [pr-number]',
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

  on('turn.complete', async ($, e, next) => {
    const b = await read($, board)

    if (b.pr && b.items.length > 0) void refreshProgress($, b.pr, b.items)

    return next(e)
  }).catch(($, e, next) => next(e))

  on('ui.focus', { requestId: PANE }, async ($, e, next) => {
    if (e.element !== 'accept' || e.origin.kind !== 'person') return next(e)

    const sel = await read($, selected)
    const ghost = await read($, suggestion)
    const typed = await read($, draft)

    if (sel === null || ghost.id !== sel || !ghost.text.startsWith(typed) || typed === ghost.text) return next(e)

    await update($, draft, () => ghost.text)

    return {}
  }).catch(($, e, next) => next(e))

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text, Button, Input, Markdown, Code } = $.ui.resolve(e)
    const { pr, items, error } = await read($, board)
    const sel = await read($, selected)
    const msg = await read($, status)
    const queued = await read($, pending)
    const typed = await read($, draft)
    const ghost = await read($, suggestion)
    const canComplete = sel !== null && ghost.id === sel && ghost.text.startsWith(typed) && typed !== ghost.text
    const roots = items.filter(c => c.parent === null)
    const prog = await read($, progress)
    const addressedCount = roots.filter(r => prog[r.id]?.state === 'addressed').length
    const toQueue = Object.values(prog).filter(v => v.state === 'addressed' && !v.queued && v.note).length
    const files = groupByFile(roots)
    const cols = e.viewport?.columns ?? 80

    const pill = (label: string, bg: string) => (
      <Text backgroundColor={bg} color="inverseText" bold>
        {` ${label} `}
      </Text>
    )

    const body = (text: string, path: string) =>
      splitBody(text).map(seg =>
        seg.suggestion ? (
          <Box flexDirection="column" borderStyle="round" borderColor="diffAdded" paddingX={1} marginY={0}>
            <Text color="diffAdded" bold>
              Suggested change
            </Text>
            <Code source={seg.text} path={path} />
          </Box>
        ) : (
          <Markdown text={seg.text} />
        ),
      )

    return (
      <Box flexDirection="column" gap={1}>
        <Box flexDirection="column">
          <Box gap={1}>
            <Text bold>PR #{pr || '?'}</Text>
            <Text dimColor>review comments</Text>
          </Box>
          <Box gap={1}>
            {pill(`${roots.length} ${roots.length === 1 ? 'thread' : 'threads'}`, 'inactive')}
            {pill(`${files.length} ${files.length === 1 ? 'file' : 'files'}`, 'inactive')}
            {addressedCount > 0 && pill(`${addressedCount} addressed`, 'success')}
            {queued > 0 && pill(`${queued} pending`, 'warning')}
          </Box>
        </Box>
        {error !== '' && <Text color="error">{error}</Text>}
        {error === '' && roots.length === 0 && <Text dimColor>No review comments.</Text>}
        {files.map(f => (
          <Box flexDirection="column" key={`f${f.path}`}>
            <Text>
              <Text bold color="claude">
                {f.path}
              </Text>
              <Text dimColor>
                {` ${f.threads.length} ${'─'.repeat(Math.max(2, cols - f.path.length - 12))}`}
              </Text>
            </Text>
            {f.threads.map(c => {
              const replies = items.filter(r => r.parent === c.id)
              const isSel = sel === c.id
              const st = prog[c.id]?.state ?? 'open'
              const note = prog[c.id]?.note ?? ''

              return (
                <Box
                  flexDirection="column"
                  key={`t${c.id}`}
                  borderStyle={isSel ? 'bold' : 'round'}
                  borderColor={isSel ? 'suggestion' : 'inactive'}
                  hover={{ borderColor: 'suggestion' }}
                  paddingX={1}
                >
                  <Button key={`c${c.id}`} onPress={() => pickThread($, c, isSel)}>
                    <Text>
                      <Text color="suggestion">{isSel ? '▾ ' : '▸ '}</Text>
                      <Text bold>{c.author}</Text>
                      <Text dimColor>
                        {c.line ? `  line ${c.line}` : ''}
                        {replies.length > 0 ? `  ${replies.length} ${replies.length === 1 ? 'reply' : 'replies'}` : ''}
                        {'  '}
                      </Text>
                      {st === 'addressed' && (
                        <Text backgroundColor="success" color="inverseText" bold>
                          {' ADDRESSED '}
                        </Text>
                      )}
                      {st === 'changed' && (
                        <Text backgroundColor="warning" color="inverseText" bold>
                          {' CHANGED '}
                        </Text>
                      )}
                    </Text>
                  </Button>
                  {body(c.body, c.path)}
                  {st !== 'open' && note !== '' && (
                    <Text color={st === 'addressed' ? 'success' : 'warning'} italic>
                      {(st === 'addressed' ? '✓ ' : '~ ') + note}
                    </Text>
                  )}
                  {replies.map(r => (
                    <Box marginTop={1}>
                      <Text color="inactive">{'│ '}</Text>
                      <Box flexDirection="column">
                        <Text dimColor>{r.author}</Text>
                        {body(r.body, c.path)}
                      </Box>
                    </Box>
                  ))}
                  {isSel && c.diffHunk !== '' && (
                    <Box flexDirection="column" marginTop={1}>
                      <Text dimColor>Diff</Text>
                      <Code source={c.diffHunk} path={c.path} format="diff" />
                    </Box>
                  )}
                  {isSel && (
                    <Box flexDirection="column" marginTop={1}>
                      <Input
                        key={`reply${c.id}`}
                        label="Reply: "
                        placeholder={ghost.id === c.id && ghost.text !== '' ? ghost.text : 'type a reply'}
                        value={typed}
                        submitLabel="add to review"
                        autoFocus
                        onInput={text => update($, draft, () => text)}
                        onSubmit={text => sendReply($, pr, c.id, text)}
                      />
                      {canComplete && (
                        <Button key="accept" plain label="⇥ Tab to complete suggestion" onPress={() => acceptSuggestion($)} />
                      )}
                    </Box>
                  )}
                </Box>
              )
            })}
          </Box>
        ))}
        <Box flexDirection="column" borderStyle="round" borderColor="inactive" paddingX={1}>
          <Input
            key="general"
            label="Comment on PR: "
            placeholder="top-level comment"
            submitLabel="post"
            onSubmit={text => sendGeneral($, pr, text)}
          />
        </Box>
        <Box flexDirection="column">
          {msg !== '' && <Text color="warning">{msg}</Text>}
          <Box gap={2}>
            {toQueue > 0 && (
              <Button key="queue" label={`Queue ${toQueue} addressed`} onPress={() => queueAddressed($, pr)} />
            )}
            {queued > 0 && <Button key="submit" label="Submit review" onPress={() => finishReview($, pr, true)} />}
            {queued > 0 && <Button key="discard" label="Discard" onPress={() => finishReview($, pr, false)} />}
            <Button key="refresh" label="Refresh" onPress={() => load($, pr)} />
          </Box>
          <Text dimColor>click a thread to reply · scroll for more</Text>
        </Box>
      </Box>
    )
  })
}
