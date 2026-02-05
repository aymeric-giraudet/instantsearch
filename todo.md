# Documentation Automation Project - Findings & Notes

> **Note to Claude**: If you load this file in context, always update it with any new findings, fixes, or progress before ending the session.

## Project Context

Building an automated system to keep documentation in sync with code changes in the InstantSearch monorepo. Documentation lives in `algolia/docs-new`, code lives in `algolia/instantsearch`.

---

## Current Architecture: Simplified Claude Code CLI

**Decision**: Use Claude Code CLI directly in GitHub Actions with an inline prompt. No separate TypeScript package needed.

**Why this approach?**
1. **Simpler** - No parsing logic to maintain, Claude reads changelogs directly
2. **More robust** - No fragile regex parsing that could break on changelog format changes
3. **Less code** - ~160 lines of YAML vs ~1400 lines of TypeScript
4. **Claude is smart** - It can read and understand changelogs better than regex

### Workflow

```
Push to master with "chore: release" commit message
    ↓
GitHub Action triggers
    ↓
Checkout instantsearch (for source reference)
Clone docs-new (for documentation updates)
Install vale + docs-new dependencies
    ↓
Run Claude Code CLI with inline prompt:
  - Read changelogs from instantsearch.js, react-instantsearch, react-instantsearch-core, vue-instantsearch
  - Explore docs-new structure
  - Update documentation for changes
  - Run linting checks and fix issues
  - Write CHANGES_SUMMARY.md with PR title/description
    ↓
Commit changes, push branch, create draft PR in docs-new
  - PR title/description from CHANGES_SUMMARY.md
  - Reviewer: algolia/frontend-experiences-web
```

---

## Key Files

- `.github/workflows/docs-automation.yml` - GitHub Actions workflow with inline Claude prompt
- ~~`scripts/docs-automation/`~~ - **DELETED** - No longer needed

---

## Manual Trigger Options

The workflow supports `workflow_dispatch` with these inputs:

| Input | Default | Description |
|-------|---------|-------------|
| `run_claude` | `false` | Whether to run Claude Code |
| `create_pr` | `false` | Whether to create PR in docs-new |

**Testing modes:**

| `run_claude` | `create_pr` | What happens |
|--------------|-------------|--------------|
| false | false | **Dry run**: Shows what would happen |
| true | false | **Preview**: Runs Claude, shows changes, no PR |
| true | true | **Full run**: Runs Claude and creates draft PR |

---

## Flavor Mapping

Each InstantSearch package maps to a documentation file extension:

| Package | Flavor | File Extension |
|---------|--------|----------------|
| instantsearch.js | JavaScript | `.js.mdx` |
| react-instantsearch | React | `.react.mdx` |
| vue-instantsearch | Vue | `.vue.mdx` |

---

## Testing on GitHub Actions

**Problem**: `workflow_dispatch` only shows in UI if workflow exists on default branch.

**Solution**: Push to your fork's main/master branch:
```bash
git remote add myfork https://github.com/YOUR_USERNAME/instantsearch.git
git push myfork feat/docs-generation:master
```

Then trigger from the Actions tab in your fork.

---

## Required Secrets

Add these to the repo (Settings → Secrets → Actions):

| Secret | Description | Required for |
|--------|-------------|--------------|
| `ANTHROPIC_API_KEY` | Anthropic API key for Claude | `run_claude=true` |
| `DOCS_REPO_PAT` | GitHub PAT with `repo` scope | Cloning/pushing to docs-new |

**To create DOCS_REPO_PAT:**
1. Go to https://github.com/settings/tokens/new
2. Note: `docs-automation`
3. Expiration: 90 days
4. Scopes: `repo` (full control)
5. Copy token, add as secret

---

## Known Issues

### ~~YAML Syntax Error with "chore: release"~~ ✅ FIXED

**Problem**: The `if` condition `startsWith(github.event.head_commit.message, 'chore: release')` causes YAML parsing errors because the colon-space (`: `) is interpreted as a YAML key-value separator.

**Solution**: Use YAML multiline `>-` syntax:
```yaml
if: >-
  github.event_name == 'workflow_dispatch' ||
  (startsWith(github.event.head_commit.message, 'chore:') && contains(github.event.head_commit.message, 'release'))
```

This avoids the colon parsing issue while still filtering for release commits.

---

## What Was Tried & Didn't Work

### GitHub Copilot Coding Agent
- Created issues in instantsearch, assigned to Copilot via GraphQL
- **Problem**: Copilot cannot work cross-repo via API
- Would need issues enabled on docs-new (they're disabled)

### TypeScript Changelog Parser
- Built a full parsing system with regex-based changelog extraction
- **Problem**: Fragile, required maintenance, added complexity
- **Decision**: Let Claude read changelogs directly instead

---

## Progress

- [x] Implement Claude Code CLI approach
- [x] Update workflow with manual trigger options
- [x] Add source reference (instantsearch available to Claude)
- [x] Remove unused Copilot code
- [x] Refactor to single PR per release (trigger on master push)
- [x] Auto-detect packages (Claude reads all changelogs)
- [x] Add linting steps (`check:links`, `check:styleguide`)
- [x] Simplify to inline prompt (removed TypeScript package)
- [x] **Fix YAML syntax error for "chore: release" filter** (use `>-` multiline)
- [x] Fix Claude file access (removed `working-directory`, updated paths)
- [x] Add react-instantsearch-core changelog
- [x] Move linting into Claude's loop (Claude runs checks and fixes issues)
- [x] Add timeouts (15min) and configurable max-turns (default 50)
- [x] Make Claude non-interactive
- [x] Add CHANGES_SUMMARY.md for better PR titles/descriptions
- [x] Add algolia/frontend-experiences-web as PR reviewer (requires `read:org` scope on PAT)
- [x] Test workflow on fork (multiple runs completed successfully)
- [ ] Add `ANTHROPIC_API_KEY` secret to instantsearch repo
- [ ] Add `DOCS_REPO_PAT` secret to instantsearch repo
- [ ] Test full workflow end-to-end
- [ ] Merge to main

---

## Commits Made

1. `feat: auto-detect packages and improve docs automation prompt`
2. `refactor: simplify docs automation to pass raw changelogs to Claude`
3. `refactor: remove TypeScript package, use inline Claude prompt`
4. `fix: quote if expression to fix YAML syntax` (didn't work)
5. `fix: use boolean comparison for workflow inputs`
6. `fix: use default Claude model`
7. `fix: properly filter for release commits only` (didn't work)
8. `fix: quote entire if expression` (didn't work)
9. `fix: use contains() to check for release commits` (too broad - matched any "release" in message)
10. `fix: improve docs automation workflow` ✅
    - Fix release commit filter with YAML multiline `>-`
    - Fix Claude file access (removed working-directory)
    - Add react-instantsearch-core changelog
    - Move linting into Claude's loop
    - Add timeouts and max-turns limits
    - Make Claude non-interactive
    - Add CHANGES_SUMMARY.md for PR titles/descriptions
    - Add team reviewer

All pushed to `aymeric-giraudet/instantsearch` master branch.

---

## Test Issues Created (cleanup needed)

During Copilot testing, these issues were created:
- https://github.com/algolia/instantsearch/issues/6891
- https://github.com/algolia/instantsearch/issues/6893

These can be closed as they were just for testing the Copilot approach.

---

## Testing Observations

### Timing Variability
- Fast runs complete in ~3 minutes with ~53 turns
- Some runs take 10+ minutes (unclear why, possibly Claude exploring more)
- The `--max-turns` flag is a "soft" limit - Claude may exceed it slightly to complete the current operation gracefully

### Turn Counting
- Turns = API round-trips (tool call + response)
- A run may show 53 turns despite a 50 limit because Claude finishes its current operation
- This is intentional behavior to avoid leaving files in an inconsistent state

### Debug Output
- Use `--verbose --output-format stream-json` to see Claude's tool calls in real-time
- Useful for understanding what Claude is doing during long runs
