export type Comment = {
  id: number
  parent: number | null
  author: string
  path: string
  line: number | null
  body: string
}

export type Board = { pr: string; items: Comment[]; error: string }

declare module 'claude-code' {
  interface PluginState {
    'pr-reply': { board: Board; selected: number | null; status: string }
  }
}
