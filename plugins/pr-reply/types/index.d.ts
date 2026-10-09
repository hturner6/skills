export type Comment = {
  id: number
  parent: number | null
  author: string
  path: string
  line: number | null
  body: string
  diffHunk: string
  commitId: string
  originalLine: number | null
}

export type Progress = { state: 'open' | 'changed' | 'addressed'; note: string; sig: string; queued: boolean }

export type Board = { pr: string; items: Comment[]; error: string }

declare module 'claude-code' {
  interface PluginState {
    'pr-reply': { board: Board; selected: number | null; status: string; pending: number; progress: Record<number, Progress>; draft: string; suggestion: { id: number | null; text: string } }
  }
}
