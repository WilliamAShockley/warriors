# RUNNER.md — LinkedIn Placement Runner Contract

The runner is the operator's **local** Playwright automation (lives outside
this codebase — see `apps/linkedin-nav` for the operator's existing tooling it
will be refactored from). This codebase never scripts LinkedIn's UI; it only
exposes the API contract below. **The send click is always human.**

## Authentication

Every request carries `Authorization: Bearer ${HORIZON_RUNNER_TOKEN}` — the
same value configured in the web app's environment. Endpoints fail closed
(503) if the token is unset, 401 on mismatch. Treat the runner like any other
credentialed client; rotate the token from Vercel env settings.

## Endpoints

Base URL: the deployed app (or `http://localhost:5820` in dev).

### `GET /api/horizon/linkedin-queue/next?missionId=<optional>`

Returns the next touch that is **approved** (release approval exists), **due**
(`nextActionAt <= now`), and in placement state `queued`:

```json
{ "touchId": "…", "personName": "Ada Okafor", "linkedinUrl": "https://…", "draftText": "…" }
```

- `204 No Content` when the queue is empty.
- Claiming is atomic (optimistic `queued → claimed` transition): two runner
  invocations — or the runner and the manual queue — can never grab the same
  touch. A claim not advanced within `HORIZON_CLAIM_TIMEOUT_MINUTES`
  (default 60) times out back to `queued`.

### `POST /api/horizon/linkedin-queue/:touchId/mark-placed`

Records placement (`placedAt`), emits a MissionEvent. Call after the draft is
sitting in the recipient's message box. A touch left in `placed` beyond
`HORIZON_PLACED_TIMEOUT_HOURS` (default 24) times out back to `queued` and
surfaces in the manual queue.

### `POST /api/horizon/linkedin-queue/:touchId/mark-sent`

Call **after the human clicked send and confirmed**. This is the only
runner-flow path that writes a LinkedIn Interaction row. It records the
interaction, advances the touch, and schedules the next one via
`nextActionAt`.

### `POST /api/horizon/linkedin-queue/:touchId/placement-failed`

Body: `{ "reason": "…", "screenshotRef": "…" }` (screenshotRef optional).
Marks the failure and returns the touch to the manual fallback queue so the
pipeline never stalls on one bad URL. If `reason` is `"checkpoint"` (LinkedIn
presented a verification/captcha interstitial), the mission's LinkedIn channel
is additionally paused and an `error` MissionEvent is emitted; the operator
resumes it from the mission detail screen.

## Runner-side requirements (the runner must implement these)

- Runs locally on the operator's machine via `launchPersistentContext`
  against their **real Chrome profile**, never headless.
- **Session mode only**: invoked deliberately, processes due touches one at a
  time — claim → navigate → place → wait for the human to send and confirm →
  `mark-sent` → next. No daemon, no background loop.
- Hard **daily cap** from config (default **25** placements) with randomized
  human-scale delays between navigations.
- Performs **no LinkedIn action other than**: navigate to the message thread,
  focus the message box, insert the draft text. It never clicks send, never
  sends connection requests, never touches any other LinkedIn surface.
- On any checkpoint, captcha, or unexpected interstitial: stop immediately,
  report `placement-failed` with reason `"checkpoint"`, and end the session.

## Manual fallback

The channel works fully with the runner absent or unconfigured: every due
touch also appears in the manual queue at `/horizon/approvals#linkedin` with a
copy button and a **mark sent** action that drives the same state machine.

## Typical session (curl-level)

```bash
TOKEN=$HORIZON_RUNNER_TOKEN; BASE=http://localhost:5820
while :; do
  TOUCH=$(curl -s -H "Authorization: Bearer $TOKEN" "$BASE/api/horizon/linkedin-queue/next")
  [ -z "$TOUCH" ] && break                          # 204 — queue empty
  ID=$(echo "$TOUCH" | jq -r .touchId)
  # …navigate, pre-fill draft…
  curl -s -X POST -H "Authorization: Bearer $TOKEN" "$BASE/api/horizon/linkedin-queue/$ID/mark-placed"
  # …human reads, tweaks, clicks send, confirms…
  curl -s -X POST -H "Authorization: Bearer $TOKEN" "$BASE/api/horizon/linkedin-queue/$ID/mark-sent"
done
```
