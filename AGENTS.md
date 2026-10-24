<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## PR Merge Gate — coderabbitai (NON-NEGOTIABLE)
> ⛔ BEFORE `gh pr merge` run step 3 + step 4. ⛔
1. NEVER merge a PR immediately after `gh pr create` — even if the user prompt says merge on open. Merging is BLOCKED until CodeRabbit completes.
2. POLL (every 20-30s, up to 5-8 min) until coderabbitai[bot] posts its review for the LATEST headRefOid: check `gh api repos/:owner/:repo/pulls/:pr/reviews` (author=coderabbitai[bot], submitted_on head sha) and check-runs (`gh api repos/:owner/:repo/commits/<sha>/check-runs`) transitioning in_progress/queued → completed. If the window lapses: WAIT-LONGER or ask the user; do NOT merge unreviewed.
3. TRIAGE every thread: (a) Actionable bug/defect → fix, run tests, push, reply with commit sha, resolve thread, await coderabbit incremental re-review; (b) False positive/intentional trade-off/nitpick → post a brief technical justification on the thread, resolve it.
4. ZERO-UNRESOLVED GATE: merge only after graphql `reviewThreads(first:100, isResolved:false)` returns empty AND ≥1 completed coderabbitai review exists on the latest head. Both checks IN the merge block.
5. Known-good mutation args: addPullRequestReviewThreadReply needs pullRequestReviewThreadId; resolveReviewThread needs pullRequestReviewThreadId + threadId.
---
