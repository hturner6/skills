#!/usr/bin/env bash
# Manage draft comments in YOUR pending (unsubmitted) review on a PR. Never submits.
# Usage: pending-review.sh add    <PR> <path> <line> <body-file> [start-line]
#        pending-review.sh list   <PR>
#        pending-review.sh edit   <comment-node-id> <body-file>
#        pending-review.sh delete <comment-node-id>
# Adds to the existing pending review if there is one, else starts one.
set -euo pipefail

usage() { sed -n '2,7p' "$0" | sed 's/^# \{0,1\}//' >&2; exit 1; }
cmd="${1:-}"; [[ -n "$cmd" ]] || usage
shift

case "$cmd" in
  add)
    [[ $# -ge 4 ]] || usage
    pr="$1"; path="$2"; line="$3"; body="$(cat "$4")"; start="${5:-}"
    pr_id="$(gh pr view "$pr" --json id --jq .id)"
    review_id="$(gh api graphql -f query='query($p:ID!){node(id:$p){... on PullRequest{reviews(states:PENDING,first:1){nodes{id viewerDidAuthor}}}}}' -f p="$pr_id" \
      --jq '.data.node.reviews.nodes[] | select(.viewerDidAuthor) | .id')"
    if [[ -z "$review_id" ]]; then
      review_id="$(gh api graphql -f query='mutation($p:ID!){addPullRequestReview(input:{pullRequestId:$p}){pullRequestReview{id}}}' -f p="$pr_id" \
        --jq .data.addPullRequestReview.pullRequestReview.id)"
    fi
    args=(-f query='mutation($r:ID!,$p:ID!,$path:String!,$line:Int!,$body:String!,$start:Int){addPullRequestReviewThread(input:{pullRequestId:$p,pullRequestReviewId:$r,path:$path,line:$line,startLine:$start,side:RIGHT,body:$body}){thread{comments(first:1){nodes{id}}}}}'
          -f r="$review_id" -f p="$pr_id" -f path="$path" -F line="$line" -f body="$body")
    [[ -n "$start" ]] && args+=(-F start="$start")
    gh api graphql "${args[@]}" --jq '.data.addPullRequestReviewThread.thread.comments.nodes[0].id'
    ;;
  list)
    [[ $# -ge 1 ]] || usage
    pr_id="$(gh pr view "$1" --json id --jq .id)"
    gh api graphql -f query='query($p:ID!){node(id:$p){... on PullRequest{reviews(states:PENDING,first:1){nodes{viewerDidAuthor comments(first:100){nodes{id path line body}}}}}}}' -f p="$pr_id" \
      --jq '.data.node.reviews.nodes[] | select(.viewerDidAuthor) | .comments.nodes[] | "\(.id)\t\(.path):\(.line // "-")\t\(.body | gsub("\n";" ") | .[0:80])"'
    ;;
  edit)
    [[ $# -ge 2 ]] || usage
    gh api graphql -f query='mutation($c:ID!,$b:String!){updatePullRequestReviewComment(input:{pullRequestReviewCommentId:$c,body:$b}){clientMutationId}}' \
      -f c="$1" -f b="$(cat "$2")" >/dev/null
    ;;
  delete)
    [[ $# -ge 1 ]] || usage
    gh api graphql -f query='mutation($c:ID!){deletePullRequestReviewComment(input:{id:$c}){clientMutationId}}' -f c="$1" >/dev/null
    ;;
  *) echo "unknown command: $cmd" >&2; usage ;;
esac
