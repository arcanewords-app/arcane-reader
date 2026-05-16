---
type: plan
status: active
domain: api
stale: false
created: 2026-05-16
updated: 2026-05-16
canonical: .cursor/rules/api.mdc
source_archive: ../archive/TOKENIZATION_PLAN.md
---

# Tokenization follow-ups

## Goal

Daily token limits enforced reliably; ops documented for reset and monitoring.

## Already implemented

- `src/middleware/tokenLimits.ts`, `src/config/tokenLimits.ts`
- API: `/api/user/token-usage`, `/api/user/token-usage/history`
- Client: `TokenUsageContext`, `useTokenLimitCheck`, indicator UI

## Open tasks

- [ ] Confirm DB schema / RPC for daily reset matches production (see `archive/TOKENIZATION_SETUP.md`)
- [ ] Edge/cron for daily reset if not in repo — document in `deployment.mdc` or Supabase dashboard
- [ ] Admin/unlimited role behavior — verify `isUnlimited` paths

## References

- `../archive/TOKENIZATION_PLAN.md`, `../archive/TOKENIZATION_SETUP.md`
