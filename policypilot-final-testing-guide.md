# PolicyPilot — Final End-to-End Testing Guide

Matched to the complete build as of May 25, 2026 (commit after fa49f43).
All 15 features, every menu item, every form, every edge case.

---

## Setup

### Two browsers side by side

- **Browser A (Chrome):** Your **mod account** — logged into reddit.com
- **Browser B (Firefox or Incognito):** Your **test account** — the "bad actor" you'll moderate

### Two terminals in your project folder

```
Terminal 1 — run the app:
npm run dev

Wait for "Playtest started" message.
```

```
Terminal 2 — watch logs:
npx devvit logs --since=now

Keep this visible. Every trigger, error, and log line shows here in real time.
```

### Your test subreddit

Always use the playtest URL:
```
reddit.com/r/policy_pilot_dev/?playtest=policy-pilot
```

### Before you start

Make sure your test subreddit has the 6 rules configured:
1. No self-promotion or spam (All)
2. Be civil and respectful (Comments & chat)
3. No low-effort or duplicate posts (Posts only)
4. Stay on topic (Posts only)
5. No misinformation or misleading content (All)
6. No ban evasion or alt account abuse (All)

---

## PHASE 1: Reputation Ledger + Mod Action Trigger

**Files under test:** `triggers/onModAction.ts`, `services/ledgerService.ts`

Everything depends on this. If mod actions don't log to Redis, nothing else works.

---

### Test 1.1 — Remove a post (first ledger entry)

**Browser B (test account):**
1. Go to `reddit.com/r/policy_pilot_dev`
2. Click "Create Post"
3. Title: `Check out my YouTube channel for free gaming tips!`
4. Body: `Subscribe here: youtube.com/fakechannel — I post daily!`
5. Click "Post"

**Browser A (mod account):**
1. Go to `reddit.com/r/policy_pilot_dev/?playtest=policy-pilot`
2. Find the post
3. Click three-dot menu (⋮) → **Remove** (Reddit's native remove)
4. Confirm removal

**Terminal 2 — check:**
- [ ] Log line shows onModAction triggered
- [ ] Action type logged as "remove" (mapped from "removelink")
- [ ] Target user is your test account
- [ ] No errors

---

### Test 1.2 — Remove two more posts (build offense history)

**Browser B:** Create and post these one at a time:
- Post 2 title: `Buy my online course — 50% discount this week only!`
- Post 3 title: `Follow me on Instagram @fakeaccount for daily content`

**Browser A:** Remove each post via Reddit's native Remove.

**Terminal 2:** Two more trigger logs should appear.

**Checkpoint:** Test user now has **3 removals** in the ledger.

---

### Test 1.3 — Remove a comment

**Browser B:**
1. Go to any existing post in the subreddit
2. Leave a comment: `This is terrible, you clearly know nothing about this topic`

**Browser A:**
1. Find that comment
2. Three-dot menu (⋮) on the **comment** → **Remove**

**Terminal 2:**
- [ ] Comment removal logged (mapped from "removecomment")

---

### Test 1.4 — Approve a post

**Browser B:** Create a legitimate post:
- Title: `What are some good resources for learning Python?`
- Body: `I'm a beginner looking for tutorials and project ideas.`

**Browser A:**
1. Go to `reddit.com/r/policy_pilot_dev/about/modqueue`
2. Find the post → click **Approve**
3. If not in modqueue: go to post → three-dot menu → **Approve**

**Terminal 2:**
- [ ] Approve action logged

---

### Test 1.5 — Ban a user (test ban logging)

**Browser A:**
1. Go to `reddit.com/r/policy_pilot_dev/about/banned`
2. Ban your test user with a 1-day temp ban
3. Check Terminal 2 for ban action log

**Then immediately unban them** so you can continue testing.

---

**PHASE 1 CHECKPOINT:**
- [ ] Test user has ~5 ledger entries (3 post removes + 1 comment remove + 1 ban)
- [ ] 1 approve action logged
- [ ] All visible in Terminal 2 logs
- [ ] No errors or crashes

If any test fails here, stop and fix it before proceeding. Copy the error from Terminal 2 and debug with Claude Code.

---

## PHASE 2: View User History + Risk Badge

**Files under test:** `menuItems/viewHistory.ts`, `services/profileService.ts`

---

### Test 2.1 — View history on a user with offenses (risk badge test)

**Browser B:** Create a new post (any content — just so there's a post by the test user to click on)

**Browser A:**
1. Find any post by your test user
2. Three-dot menu (⋮) → **View User History**

**What you should see (two things simultaneously):**

**Toast (instant, bottom of screen):**
- [ ] Shows risk emoji: should be 🔴 (test user has 3+ offenses)
- [ ] Format: `🔴 u/testuser — Escalation Zone (X offenses) | Account: Xd | Karma: X.XK`
- [ ] Account age number is correct
- [ ] Karma is formatted correctly (e.g., "1.2K" not "1234")

**Quick summary form (popup):**
- [ ] Title: `u/testuser — Risk Check`
- [ ] Shows risk sentence: "🔴 X offenses in the last 30 days — escalation candidate."
- [ ] Shows account age and karma
- [ ] Two buttons: **"View Full History"** and **"Dismiss"**

---

### Test 2.2 — Click "View Full History"

From the quick summary form in Test 2.1:
1. Click **"View Full History"**

**What you should see (detail form):**
- [ ] Title: `History — u/testuser`
- [ ] Profile block: account age, karma
- [ ] 30-day offense breakdown by rule (e.g., "Rule 1: 3 offenses")
- [ ] Recent action log: each entry with icon, action type, date, mod name, playbook indicator
- [ ] At least 4-5 entries matching your Phase 1 actions
- [ ] "Mark as reviewed" checkbox (pre-checked)
- [ ] Close button

---

### Test 2.3 — View history on a clean user

**Browser A:**
1. Find or create a post by **your own mod account**
2. Three-dot menu (⋮) → **View User History**

**What you should see:**
- [ ] Toast: `🟢 u/modaccount — Clean | Account: Xd | Karma: X.XK`
- [ ] Quick summary: "🟢 No offenses in the last 30 days."
- [ ] No crash, no error

---

### Test 2.4 — View history from a comment

**Browser A:**
1. Find a comment by your test user
2. Three-dot menu (⋮) on the **comment** → **View User History**

**What you should see:**
- [ ] Same history as Test 2.1 — correctly resolves the comment author
- [ ] Risk badge matches the user's offense count

---

**PHASE 2 CHECKPOINT:**
- [ ] Risk badges show correctly (🟢🟡🔴 based on offense count)
- [ ] Toast + form appear simultaneously
- [ ] "View Full History" loads detailed log
- [ ] Works on posts AND comments
- [ ] Clean users show 🟢 with no errors
- [ ] Profile data (age, karma) is accurate

---

## PHASE 3: Playbook Engine (Core Feature — Test Thoroughly)

**Files under test:** `menuItems/configPlaybook.ts`, `menuItems/runPlaybook.ts`, `services/playbookService.ts`

This is your demo money shot. Spend the most time here.

---

### Test 3.1 — Create a playbook (with dynamic rules)

**Browser A (mod account):**
1. Click three-dot menu on the **subreddit** (not a post)
2. Find and click **"Configure Playbooks"**

**First check — dynamic rules:**
- [ ] The "Target Rule" dropdown shows YOUR subreddit's actual rules
- [ ] Format: "Rule 1 — No self-promotion or spam" (not generic "Rule 1")
- [ ] If rules fail to load, fallback shows generic "Rule 1"..."Rule 6"

**Fill in the form:**
- Name: `Spam Escalation`
- Target Rule: `Rule 1 — No self-promotion or spam`
- 1st offense action: `Remove content`
- 2nd offense action: `Remove + warn via modmail`
- 3rd offense action: `Temp ban`
- Temp ban duration: `7` (days)
- Message template: `Your post was removed for violating our self-promotion rule. Please review the subreddit rules.`
- Post distinguished removal comment: **ON** (toggle enabled)
- New account gate: **OFF** (leave disabled for now)

3. Click Save/Submit

**What you should see:**
- [ ] Success toast: `Playbook "Spam Escalation" created.`
- [ ] Immediately after: **Manage Playbooks** form opens showing your new playbook in the list

4. Click **Close/Cancel** on the Manage form

---

### Test 3.2 — Run playbook on a first-time offender

**You need a user with ZERO prior offenses for this specific rule.** Options:
- If your test user's Phase 1 removals weren't tagged with ruleId "1", they won't count against this playbook
- Or use a third Reddit account
- Or if you understand the ledger, the Phase 1 removals may have no ruleId since they were native Reddit removes (not via playbook)

**Browser B (test account or clean account):**
1. Create post: `Subscribe to my Twitch channel for free giveaways!`

**Browser A (mod account):**
1. Find the post
2. Three-dot menu (⋮) → **"Run Playbook"**
3. **Step 1 form:** Select "Spam Escalation" from the playbook list
4. Click next/submit

**Step 2 — evaluate (what you should see):**
- [ ] Reasoning shown: something like "priorOffenses lt 1: yes" (0 offenses < 1 = true = Tier 1)
- [ ] Recommended action: **Remove** (1st offense tier)
- [ ] Message field visible (because postModComment is enabled)
- [ ] Message pre-filled with your template or default removal reason
- [ ] Override option available

5. Click **Confirm/Execute**

**After confirmation, check ALL of these:**
- [ ] Post is removed (verify in Browser B — post shows [removed])
- [ ] Distinguished mod comment appears on the removed post:
  - [ ] Comment text matches the removal reason
  - [ ] Comment has the green mod badge (distinguished)
  - [ ] Comment is stickied (pinned to top)
- [ ] Terminal 2: ledger entry logged with `usedPlaybook: true`
- [ ] Terminal 2: no errors from submitComment or distinguish

**Check warning delivery:**
- [ ] If the action was "remove" only (Tier 1), no modmail sent — just the mod comment
- [ ] The removal reason comment IS the user notification for this tier

---

### Test 3.3 — Run playbook again (should escalate to Tier 2)

**Browser B:** Create post: `Check out my dropshipping store — use code FAKE20!`

**Browser A:**
1. Three-dot menu (⋮) → **"Run Playbook"**
2. Select "Spam Escalation"

**What you should see:**
- [ ] Reasoning: "priorOffenses lt 1: no → priorOffenses lt 2: yes" (1 offense = Tier 2)
- [ ] Recommended action: **Remove + warn via modmail** (different from Test 3.2!)
- [ ] Message field visible

3. Confirm

**Check:**
- [ ] Post removed
- [ ] Mod comment posted (distinguished + stickied) if postModComment is on
- [ ] Modmail warning sent — **Browser B:** check inbox/modmail for the warning message
  - This uses `reddit.modMail.createConversation()` — verify the message actually arrived
- [ ] Ledger entry with usedPlaybook: true

---

### Test 3.4 — Run playbook again (should escalate to Tier 3 — temp ban)

**Browser B:** Create post: `FREE CRYPTO — join my Discord for daily signals!`

**Browser A:** Run Playbook → Spam Escalation

**What you should see:**
- [ ] Reasoning: "priorOffenses lt 1: no → priorOffenses lt 2: no → else" (2+ offenses = Tier 3)
- [ ] Recommended action: **Temp ban 7 days**

Confirm.

**Check:**
- [ ] Post removed
- [ ] User is temp-banned — verify at `reddit.com/r/policy_pilot_dev/about/banned`
- [ ] Ban duration shows 7 days
- [ ] Ledger entry logged

**CRITICAL:** Unban the user after this test: Banned users page → remove ban.

---

### Test 3.5 — Create a playbook with new-account gate

**Browser A:**
1. Subreddit menu → **Configure Playbooks**
2. Create:
   - Name: `Civility Check`
   - Target Rule: `Rule 2 — Be civil and respectful`
   - 1st offense: Remove content
   - 2nd offense: Remove + warn
   - 3rd offense: Temp ban 3 days
   - New account gate: **ON**
   - Account age threshold: `30` (days)
   - Gate action: `Temp ban` (immediately temp ban new accounts)
3. Save

**Browser B (test account — likely a new-ish account):**
1. Leave an uncivil comment on any post

**Browser A:** Run Playbook → Civility Check

**What you should see:**
- [ ] If test account is < 30 days old: reasoning shows "accountAge lt 30: yes" → immediate gate action (temp ban)
- [ ] If test account is > 30 days old: reasoning skips the gate → evaluates offense tiers normally

This tests the conditional branching in the decision tree.

---

### Test 3.6 — Create a zero-tolerance playbook

**Browser A:**
1. Configure Playbooks → Create:
   - Name: `Ban Evasion — Zero Tolerance`
   - Target Rule: `Rule 6 — No ban evasion`
   - 1st offense: Permanent ban
   - 2nd offense: Permanent ban
   - 3rd offense: Permanent ban
2. Save

**Browser B:** Create post: `Yeah I got banned before but I'm back lol`

**Browser A:** Run Playbook → Ban Evasion

**Check:**
- [ ] Immediately suggests **Permanent ban** regardless of history
- [ ] After confirming, user is permanently banned
- [ ] Verify at `reddit.com/r/policy_pilot_dev/about/banned` — no expiration date

**Unban after test.**

---

### Test 3.7 — Edge case: Run Playbook with no playbooks

If possible (or on a fresh sub):
1. Delete all playbooks via Manage Playbooks (Test 5.2 below)
2. Go to a post → three-dot menu → "Run Playbook"

**Check:**
- [ ] Graceful message or empty playbook list — NOT a crash

**(Re-create your playbooks after this test)**

---

### Test 3.8 — Edge case: Run Playbook on a [deleted] user's post

**Browser B:** Create a post, then delete the post

**Browser A:** If the post is still visible with [deleted] author, try "Run Playbook"

**Check:**
- [ ] Graceful error handling — "Could not identify content author" or similar
- [ ] No crash, no unhandled exception

---

**PHASE 3 CHECKPOINT:**
- [ ] Playbook creation works with dynamic rule names
- [ ] Escalation sequence works: Tier 1 → Tier 2 → Tier 3 across violations
- [ ] Removal reason comment posts as distinguished + stickied
- [ ] Modmail warnings arrive in the test user's inbox
- [ ] New-account gate branches correctly based on account age
- [ ] Zero-tolerance playbook skips all escalation
- [ ] Edge cases handled gracefully

**This IS your demo video.** If 3.2 → 3.3 → 3.4 flow smoothly, you have a winning submission.

---

## PHASE 4: Dashboard

**Files under test:** `routes/api.ts` (GET /api/dashboard), `services/metricsService.ts`, `pages/Dashboard.tsx`, `splash.tsx`, `core/post.ts`

---

### Test 4.1 — Create the dashboard post

**Browser A (mod account):**
1. Subreddit three-dot menu → **"Create Dashboard Post"**

**What you should see:**
- [ ] A new custom post appears in your subreddit
- [ ] You're navigated to it automatically
- [ ] First view: **Splash screen** with PolicyPilot branding

**Check the splash screen:**
- [ ] PP monogram icon badge with gradient
- [ ] Staggered fade-in animation on each section
- [ ] Feature card visible
- [ ] Gradient CTA button
- [ ] No broken layout or missing elements

---

### Test 4.2 — Open the dashboard

Click the CTA button on the splash to open the dashboard (or it may load automatically).

**Check each section:**

**Loading state (first moment):**
- [ ] Shimmer skeleton placeholders visible while data loads
- [ ] No flash of empty/broken content

**Animated count-up stats:**
- [ ] Numbers animate from 0 to their final value (ease-out cubic)
- [ ] Total actions count matches your Phase 1 + Phase 3 actions
- [ ] Values are reasonable (not "0" if you have data, not "undefined")

**Action breakdown bars:**
- [ ] Spring animation on bar widths when they appear
- [ ] Bars labeled by action type (remove, approve, warn, tempban, permban)
- [ ] Heights/widths proportional to actual counts (most should be "remove")

**Recent action log:**
- [ ] Actions listed in reverse chronological order (newest first)
- [ ] Color-coded by action type
- [ ] Each entry shows: mod name, target user, action, timestamp
- [ ] Most recent action from Phase 3 is at the top

**Top offenders:**
- [ ] Your test user(s) should appear
- [ ] Offense count is correct

**Mod workload:**
- [ ] Your mod account listed with all actions attributed

---

### Test 4.3 — Dashboard accuracy check

Count your actions manually and compare:

| Action type | Expected count (approximate) |
|---|---|
| remove | 3 (Phase 1) + 3 (Phase 3 playbook runs) = ~6 |
| approve | 1 (Phase 1) |
| warn | 1 (Phase 3 Tier 2 modmail) |
| tempban | 1-2 (Phase 3 Tier 3 + possible gate test) |
| permban | 1 (Phase 3 zero-tolerance test) |

**Check:**
- [ ] Numbers in dashboard roughly match your manual count
- [ ] Playbook usage rate reflects the split between Phase 1 (manual) and Phase 3 (playbook)

---

### Test 4.4 — Dashboard refresh after new actions

**Browser B:** Create a new post
**Browser A:** Remove it manually (NOT via playbook)

**Check:**
- [ ] Navigate away from dashboard post and back
- [ ] Recent action log shows the new removal
- [ ] Note: count-up stats may not update until the hourly scheduler runs

---

### Test 4.5 — Dashboard dark mode

1. Toggle Reddit to dark mode (settings → dark mode)
2. Open the dashboard post

**Check:**
- [ ] All elements readable in dark mode
- [ ] No white-on-white or invisible text
- [ ] Charts and bars still visible with proper contrast

---

### Test 4.6 — Dashboard on mobile (if possible)

1. Open `reddit.com/r/policy_pilot_dev` on your phone or in a narrow browser window
2. Find the dashboard post → open it

**Check:**
- [ ] Web view loads
- [ ] Layout doesn't overflow horizontally
- [ ] Can scroll through all sections
- [ ] Text is readable

---

**PHASE 4 CHECKPOINT:**
- [ ] Dashboard creates successfully with splash screen
- [ ] All metrics sections populate with real data
- [ ] Animations work (count-up, spring bars, shimmer loading)
- [ ] Data is accurate against manual count
- [ ] Dark mode works
- [ ] Mobile is at least functional

---

## PHASE 5: Manage & Preview Playbooks

**Files under test:** `menuItems/configPlaybook.ts` (manage + preview handlers)

---

### Test 5.1 — Preview Playbook

**Browser A:**
1. Subreddit menu → **"Preview Playbook"**
2. Select "Spam Escalation" from the dropdown
3. Click "Run Preview →"

**What you should see:**
- [ ] Title: `Preview — Spam Escalation`
- [ ] Description includes: `Playbook: "Spam Escalation" · Rule 1`
- [ ] List of users with their predicted tier:
  ```
  u/testuser → Tier 3 (tempban 7d)
  u/otheruser → Tier 1 (remove)
  ```
- [ ] Disclaimer: "No actions were taken. This is a dry-run only."
- [ ] Close button

**Check:**
- [ ] No actual actions taken (no removals, no bans, no modmail sent)
- [ ] Terminal 2 shows NO ledger writes during preview
- [ ] Tier assignments are correct based on each user's offense count

---

### Test 5.2 — Manage Playbooks (delete)

**Browser A:**
1. Subreddit menu → **"Manage Playbooks"**

**What you should see:**
- [ ] Form lists all your playbooks (Spam Escalation, Civility Check, Ban Evasion)
- [ ] Count shown: "3 playbooks configured"

2. Select "Civility Check" → click **"Delete Selected →"**

**Confirmation form:**
- [ ] Shows: `Delete "Civility Check"? This cannot be undone.`
- [ ] Has "Delete Playbook" and "Cancel" buttons

3. Click **"Delete Playbook"**

**Check:**
- [ ] Success toast: `Playbook "Civility Check" deleted.`
- [ ] If you re-open Manage Playbooks, only 2 playbooks remain

---

### Test 5.3 — Manage Playbooks with no playbooks (edge case)

If you delete all playbooks:
1. Subreddit menu → "Manage Playbooks"

**Check:**
- [ ] Toast: "No playbooks yet. Create one first..."
- [ ] No crash

**(Re-create your playbooks after this test)**

---

## PHASE 6: Auto-Escalation Alerts

**Files under test:** `scheduler/thresholdChecker.ts`

---

### Test 6.1 — Threshold crossed → modmail alert

**Check your app settings first:**
- Go to your app's settings in the subreddit
- Verify: `autoEscalationEnabled` = true, `warningsBeforeTempBan` = 3, `timeWindowDays` = 30

**Your test user should already have 3+ offenses from Phases 1 and 3.**

The threshold checker runs hourly. To test:
1. Wait for the scheduler to run (check Terminal 2 for scheduler logs)
2. OR check if the threshold was already triggered during earlier testing

**Check modmail:**
1. Go to `reddit.com/r/policy_pilot_dev/about/modqueue` or the modmail tab
2. Look for a modmail from PolicyPilot about your test user

**What the alert should say:**
- [ ] Subject includes `[PolicyPilot]` and the username
- [ ] Body includes offense count and time window
- [ ] Alert was deduplicated (only one alert per user per time window)

**Terminal 2:**
- [ ] Scheduler log showing threshold check ran
- [ ] Note ledger entry with modId: 'PolicyPilot' for the auto-escalation

---

### Test 6.2 — Disable auto-escalation

1. Go to app settings → set `autoEscalationEnabled` = false
2. Wait for scheduler to run

**Check:**
- [ ] No new alerts sent
- [ ] Terminal 2 shows scheduler ran but skipped because disabled

**(Re-enable after testing)**

---

## PHASE 7: Generate Mod Report

**Files under test:** `menuItems/modReport.ts`

---

### Test 7.1 — Generate a report

**Browser A:**
1. Subreddit menu → **"Generate Mod Report"**
2. Wait a moment (it aggregates 7 days of data)

**What you should see:**
- [ ] You're navigated to a new self-text post in your subreddit
- [ ] Post title includes "PolicyPilot" and a date range

**Check the report content:**
- [ ] Summary table: total actions, unique users, playbook usage %, active alerts
- [ ] Actions by type with icons
- [ ] Actions by moderator (your mod account listed)
- [ ] Top 5 offenders (your test user should be #1)
- [ ] Auto-escalation alerts section (if any alerts are active)
- [ ] Numbers are accurate against what you've done in testing

---

### Test 7.2 — Generate report with no data (edge case)

If possible (fresh subreddit or cleared data):
1. Generate Mod Report

**Check:**
- [ ] Report renders with zeros / "no data" — not a crash
- [ ] Post is still created successfully

---

## PHASE 8: Toolbox Integration

**Files under test:** `services/ledgerService.ts` (Toolbox sync in addLedgerEntry)

---

### Test 8.1 — Check Toolbox usernote sync

This only works if your test subreddit has Toolbox set up (wiki pages exist).

**Option A: Install the Toolbox browser extension**
1. Install from Chrome Web Store
2. After any playbook action, check Toolbox's usernote indicator on the user
3. Should show a note like "REMOVE | Rule 1 | playbook"

**Option B: Check the wiki page directly**
1. Go to `reddit.com/r/policy_pilot_dev/wiki/usernotes`
2. Look for entries matching your test user

**If Toolbox isn't set up:**
- [ ] Verify no errors in Terminal 2 (the sync should fail silently)
- [ ] Ledger entries still wrote correctly to Redis (Toolbox failure doesn't block the core)

---

## PHASE 9: Edge Cases & Stress Tests

---

### Test 9.1 — Rapid-fire actions

1. Remove 5 posts in quick succession (within 10 seconds)
2. Check: no duplicate ledger entries, no missed entries

### Test 9.2 — View history on user with many entries

1. If your test user has 10+ ledger entries from all the testing
2. View History → View Full History
3. Check: loads without timeout, entries display correctly

### Test 9.3 — Multiple playbooks for same rule

1. Create a second playbook targeting Rule 1
2. Run Playbook → both should appear in the selection list
3. Each should work independently

### Test 9.4 — Run Playbook on a comment (not just posts)

**Browser B:** Leave a comment that violates Rule 2

**Browser A:**
1. Three-dot menu on the **comment** → "Run Playbook"
2. Select Civility Check (or whatever playbook matches Rule 2)

**Check:**
- [ ] Playbook evaluates correctly for comments
- [ ] Comment is removed (not the parent post)
- [ ] Note: postModComment (distinguished removal comment) should NOT fire for comments — only posts

### Test 9.5 — Session timeout (15-min TTL)

1. Start "Run Playbook" → select a playbook (Step 1)
2. Wait 15+ minutes
3. Try to continue (Step 2)

**Check:**
- [ ] Graceful "session expired" message — not a crash

---

## Final Verification Checklist

Before recording your demo video, verify all features one more time:

| # | Feature | Working? |
|---|---------|----------|
| 1 | Mod actions auto-log to ledger | ☐ |
| 2 | View History shows risk badge toast (🟢🟡🔴) | ☐ |
| 3 | View History → Full History shows detailed log | ☐ |
| 4 | Configure Playbooks with dynamic rule names | ☐ |
| 5 | Run Playbook evaluates + recommends correct tier | ☐ |
| 6 | Playbook escalation works (Tier 1→2→3) | ☐ |
| 7 | Removal reason posts as distinguished mod comment | ☐ |
| 8 | Modmail warnings sent via createConversation | ☐ |
| 9 | Temp ban / perm ban execute correctly | ☐ |
| 10 | Preview Playbook dry-run (no side effects) | ☐ |
| 11 | Manage Playbooks (list + delete with confirm) | ☐ |
| 12 | Dashboard creates with splash screen | ☐ |
| 13 | Dashboard shows accurate metrics + animations | ☐ |
| 14 | Auto-escalation alerts via modmail | ☐ |
| 15 | Generate Mod Report as self-text post | ☐ |
| 16 | Toolbox usernote sync (silent fail if no Toolbox) | ☐ |
| 17 | Edge cases: no crash on [deleted] user, empty states, session timeout | ☐ |

---

## After All Tests Pass

### 1. Upload a stable build

```bash
npx devvit upload
```

This saves your current version. If you make polish changes later and break something, you can revert to this.

### 2. Seed demo data

Before recording your demo video, you want a subreddit with realistic-looking data:
- At least 3-4 different playbooks created
- 10+ mod actions in the ledger (mix of removes, warns, bans)
- At least one user with 3+ offenses (to show full escalation)
- Dashboard populated with this data

### 3. Record demo video

Follow the script from the build plan:
1. Hook (15s) — "AutoMod is stateless. PolicyPilot is not."
2. Show the problem (30s) — user violates rules, no memory
3. Create playbook (30s) — show dynamic rules, configure escalation
4. Run playbook 3x (45s) — the escalation sequence: warn → warn → temp ban
5. View History (15s) — show risk badge + full history
6. Dashboard (15s) — show metrics with animations
7. Close (15s) — tagline

### 4. Submit on Devpost

Before May 27, 2026 @ 6:00 PM PDT.
