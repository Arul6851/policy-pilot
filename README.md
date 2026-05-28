# PolicyPilot

**Consistent, memory-aware moderation for Reddit communities.**

AutoMod is stateless — it treats every interaction as the first. PolicyPilot adds memory and consistency: every mod action is logged to a per-user reputation ledger, playbooks walk mods through the correct escalation tier automatically, and a live dashboard surfaces top offenders before they become a problem.

Built for the **Reddit Mod Tools & Migrated Apps Hackathon 2026**.

---

## What It Does

| Feature | Description |
|---|---|
| **Reputation Ledger** | Every mod action (remove, warn, tempban, permban, approve) is automatically logged per user with timestamps, rule IDs, and playbook usage flags |
| **Playbook Engine** | Senior mods define decision trees — if Rule X + account age + prior offenses → action. Any mod runs the playbook and gets walked through the correct step |
| **View User History** | Context menu on any post/comment → see risk level, offense count, full action log |
| **Run Playbook** | Context menu on any post/comment → select a playbook → follow step-by-step guided moderation |
| **Configure Playbooks** | Build and manage playbook definitions tied to subreddit rules |
| **Manage Playbooks** | List, review, and delete existing playbooks |
| **Generate Mod Report** | One-click report posted to the subreddit with 7-day team stats, top offenders, and playbook usage |
| **Ops Dashboard** | Mod-only custom post showing team metrics, offenders approaching thresholds, and consistency scores |
| **Auto-Escalation Alerts** | Scheduler checks offender thresholds and sends modmail alerts automatically |

**No AI. No external APIs. 100% deterministic** — pure logic on Devvit's infrastructure with Redis storage.

---

## How It Works

```
Reddit mod action
      │
      ▼
onModAction trigger ──► Reputation Ledger (Redis sorted set, score = timestamp)
                              │
                    ┌─────────┴──────────┐
                    ▼                    ▼
             View History          Run Playbook
          (risk assessment)    (step-by-step guidance)
                    │                    │
                    └─────────┬──────────┘
                              ▼
                     Ops Dashboard + Reports
```

Triggers fire automatically on every mod action — no extra steps for the mod team. The ledger is the single source of truth that all other features read from.

---

## Menu Items

All menu items appear in the right-click context menu on posts and comments (moderators only).

| Menu Item | Where | Description |
|---|---|---|
| View User History | Post / Comment | Quick risk check toast + full action log form |
| Run Playbook | Post / Comment | Step-by-step guided moderation flow |
| Configure Playbooks | Subreddit | Create new playbooks tied to subreddit rules |
| Manage Playbooks | Subreddit | List, review, and delete existing playbooks |
| Generate Mod Report | Subreddit | Post a 7-day activity report to the subreddit |

---

## App Settings

Configurable per subreddit in the Devvit App Settings panel:

| Setting | Default | Description |
|---|---|---|
| Auto-escalation enabled | `true` | Whether the threshold checker sends modmail alerts |
| Dashboard refresh interval | `30` min | How often the ops dashboard metrics are recomputed |
| Threshold check interval | `60` min | How often the escalation alert scheduler runs |
| Offense window days | `30` days | Rolling window for offense counting |

---

## Redis Schema

All keys are automatically namespaced per subreddit by Devvit's Redis runtime.

| Key | Type | Purpose |
|---|---|---|
| `ledger:{userId}` | Sorted Set (score = timestamp) | Per-user moderation history |
| `ledger:users` | Sorted Set (score = timestamp) | Index of all users with ledger entries |
| `playbook:{playbookId}` | String (JSON) | Playbook definition with decision tree |
| `playbooks:index` | Hash | Index of all playbook IDs → names |
| `metrics:daily:{YYYY-MM-DD}` | String (JSON) | Pre-computed daily dashboard metrics |
| `profile:{userId}` | String (JSON, TTL 1 hr) | Cached public user profile data |
| `config:app` | String (JSON) | App-level configuration |
| `config:dashPostId` | String | ID of the dashboard custom post |
| `dashboard:lastRefresh` | String | Timestamp of last dashboard refresh |
| `alert:sent:{userId}` | String (TTL 24 hr) | Deduplication key for escalation alerts |
| `session:pb:{modId}:{targetId}` | String (JSON, TTL 15 min) | In-progress playbook session state |

---

## Tech Stack

- **[Devvit](https://developers.reddit.com/) `@devvit/web` v0.12.24** — Reddit Developer Platform runtime
- **[Hono](https://hono.dev/) 4.12.21** — Server routing
- **[React](https://react.dev/) 19.2.6** — Dashboard web view UI
- **[Tailwind CSS](https://tailwindcss.com/) 4.3.0** — Styles
- **[Vite](https://vite.dev/) 8** — Client bundler
- **TypeScript 6** — End-to-end type safety
- **[toolbox-devvit](https://github.com/nicholasgasior/toolbox-devvit) 0.4.0** — Optional Toolbox usernote sync

---

## Development

> Requires Node 22.

```bash
# Start live playtest on your test subreddit
devvit playtest <subreddit-name>

# Build client and server
npm run build

# Upload a new version (private, only you can install)
devvit upload

# Publish publicly to the App Directory
devvit publish

# Type-check, lint, and format
npm run type-check
```

### Testing Flow

1. Install the app on your test subreddit via `devvit playtest`
2. Create a test post with a second account
3. Remove it as a mod → `onModAction` trigger fires → entry logged to ledger
4. Right-click the same user's post → **View User History** → verify offense count
5. Create a playbook via **Configure Playbooks**
6. Right-click a flagged post → **Run Playbook** → follow the guided flow
7. Right-click the subreddit → **Generate Mod Report** → verify the report post

---

## Design Principles

1. **Fully deterministic** — No AI, no external calls. Pure logic on Devvit's infrastructure.
2. **Community sovereignty** — All data stays local to the subreddit. No cross-community data.
3. **Complement, don't replace** — Works alongside AutoMod. AutoMod catches violations; PolicyPilot decides the response.
4. **Speed over cleverness** — Every interaction is sub-second. Cache aggressively, compute lazily.
5. **Human in the loop** — PolicyPilot walks mods through decisions but never acts autonomously.

---

## License

BSD-3-Clause
