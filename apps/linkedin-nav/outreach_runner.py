#!/usr/bin/env python3
"""
LinkedIn outreach runner — the hands behind the Allocator's /linkedin page.

The page is a queue: each person the reader presses Send on becomes a job.
This script claims jobs from the Allocator's API one at a time, opens the
profile in a real browser using the saved LinkedIn session, sends the
message, and reports back exactly what it typed and by which path:

    connect_note   a connection request with the message as its note
                   (anyone you are not yet connected to)
    message        a direct message (people you are already connected to)

Modes
    --drain    work the queue until it is empty, then exit. This is what
               the Allocator starts when you press Send on this machine.
    --watch    keep polling forever. Use this against a hosted Allocator:
                   ALLOCATOR_URL=https://… ALLOCATOR_TOKEN=<app password> \\
                   python outreach_runner.py --watch
    --check    open LinkedIn and say whether the saved session still works.

A job marked "rehearse" does everything except press the final send
button, saves a screenshot to outreach_logs/, and backs out.

Environment
    ALLOCATOR_URL          default http://localhost:5821
    ALLOCATOR_TOKEN        the Allocator's APP_PASSWORD (omit if the gate is open)
    LINKEDIN_SESSION_FILE  default ./linkedin_session.json, then
                           ~/linkedin-nav-env/linkedin_session.json
                           (create or refresh with save_session.py)
"""

import argparse
import json
import os
import random
import re
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

HERE = Path(__file__).resolve().parent
LOG_DIR = HERE / "outreach_logs"
API = os.environ.get("ALLOCATOR_URL", "http://localhost:5821").rstrip("/")
TOKEN = os.environ.get("ALLOCATOR_TOKEN", "").strip()

LOGIN_MARKERS = ("/login", "/authwall", "/checkpoint", "/uas/", "/signup")
WATCHING = False
NAME_PREFIXES = {"dr", "dr.", "mr", "mr.", "mrs", "mrs.", "ms", "ms.", "prof", "prof."}


class SessionExpired(Exception):
    """LinkedIn sent us to a login wall: stop the run, leave jobs queued."""


class JobFailed(Exception):
    """This one profile could not be done; the reason is shown on the page."""


def log(*parts):
    print(time.strftime("%Y-%m-%d %H:%M:%S"), *parts, flush=True)


# ── Allocator API ─────────────────────────────────────────────────────

def api(body, retries=3):
    data = json.dumps(body).encode()
    headers = {"Content-Type": "application/json"}
    if TOKEN:
        headers["Authorization"] = f"Bearer {TOKEN}"
    last = None
    for attempt in range(retries):
        try:
            req = urllib.request.Request(f"{API}/api/linkedin/runner", data=data, headers=headers, method="POST")
            with urllib.request.urlopen(req, timeout=30) as res:
                return json.loads(res.read().decode() or "{}")
        except urllib.error.HTTPError as e:
            if e.code in (401, 403):
                raise SystemExit(f"The Allocator refused the runner ({e.code}). Set ALLOCATOR_TOKEN to the app password.")
            last = e
        except Exception as e:  # network blip: try again
            last = e
        time.sleep(2 * (attempt + 1))
    raise RuntimeError(f"Allocator unreachable at {API}: {last}")


def report(job, ok, **fields):
    try:
        api({"action": "report", "id": job["id"], "ok": ok, **fields}, retries=5)
    except Exception as e:
        log("!! could not report result:", e)


# ── Browser ───────────────────────────────────────────────────────────

def session_file():
    candidates = [
        os.environ.get("LINKEDIN_SESSION_FILE"),
        HERE / "linkedin_session.json",
        Path.home() / "linkedin-nav-env" / "linkedin_session.json",
    ]
    for c in candidates:
        if c and Path(c).is_file():
            return Path(c)
    raise SystemExit("No LinkedIn session found. Run save_session.py, or set LINKEDIN_SESSION_FILE.")


def open_browser(p, headless):
    launch = dict(headless=headless, args=["--disable-blink-features=AutomationControlled"])
    try:
        browser = p.chromium.launch(channel="chrome", **launch)  # the installed Google Chrome
    except Exception:
        browser = p.chromium.launch(**launch)  # Playwright's own Chromium, if installed
    context = browser.new_context(storage_state=str(session_file()), viewport={"width": 1280, "height": 900})
    context.set_default_timeout(15_000)
    return browser, context


def pause(lo, hi):
    time.sleep(random.uniform(lo, hi))


def walled(page):
    url = page.url
    return any(m in url for m in LOGIN_MARKERS)


def shot(page, slug, tag):
    LOG_DIR.mkdir(exist_ok=True)
    path = LOG_DIR / f"{time.strftime('%Y%m%d-%H%M%S')}-{slug[:40]}-{tag}.png"
    try:
        page.screenshot(path=str(path))
        return path.name
    except Exception:
        return None


def first_visible(locator, limit=8):
    try:
        n = min(locator.count(), limit)
    except Exception:
        return None
    for i in range(n):
        el = locator.nth(i)
        try:
            if el.is_visible():
                return el
        except Exception:
            pass
    return None


def human_type(page, target, text):
    """Type like a person. Shift+Enter for line breaks: in the message box a
    bare Enter can send, and nothing here may send by accident."""
    target.click()
    pause(0.3, 0.7)
    lines = text.split("\n")
    for i, line in enumerate(lines):
        if line:
            page.keyboard.type(line, delay=random.randint(22, 48))
        if i < len(lines) - 1:
            page.keyboard.press("Shift+Enter")
    pause(0.5, 1.0)


def squash(s):
    return re.sub(r"\s+", " ", s or "").strip()


def first_name_of(full):
    words = [w for w in (full or "").replace(",", " ").split() if w]
    while words and words[0].lower() in NAME_PREFIXES:
        words.pop(0)
    return words[0] if words else ""


def fill_template(text, first):
    return re.sub(r"\{\s*first_?name\s*\}", first, text, flags=re.I)


# ── The act ───────────────────────────────────────────────────────────

def read_profile(page):
    main = page.locator("main")
    name = ""
    try:
        name = squash(main.locator("h1").first.inner_text(timeout=10_000))
    except Exception:
        pass
    headline = ""
    for sel in (".text-body-medium.break-words", ".text-body-medium"):
        try:
            el = main.locator(sel).first
            if el.count():
                headline = squash(el.inner_text(timeout=2_000))
                if headline:
                    break
        except Exception:
            pass
    return name, headline


def connect_locator(page, name):
    main = page.locator("main")
    if name:
        exact = main.locator(f'[aria-label="Invite {name} to connect"]')
        el = first_visible(exact)
        if el:
            return el
    # The newer profile renders Connect as a link to the invite composer.
    el = first_visible(main.locator('a[href*="/preload/custom-invite/"]'))
    if el:
        return el
    return None


def find_connect(page, name):
    el = connect_locator(page, name)
    if el:
        return el
    # Often tucked under "More" in the top card.
    more = first_visible(page.locator('main button[aria-label="More actions"]'))
    if more:
        more.click()
        pause(0.8, 1.4)
        el = connect_locator(page, name)
        if el:
            return el
        page.keyboard.press("Escape")
        pause(0.3, 0.6)
    return None


def is_first_degree(page):
    main = page.locator("main")
    try:
        badge = main.locator(".dist-value").first
        if badge.count():
            return "1st" in badge.inner_text(timeout=2_000)
    except Exception:
        pass
    try:
        top = main.locator("section").first.inner_text(timeout=3_000)
        return bool(re.search(r"(·|•)\s*1st\b", top))
    except Exception:
        return False


def send_connect(page, job, button, text, state):
    limit = int(job.get("noteLimit") or 300)
    if len(text) > limit:
        raise JobFailed(f"The note is {len(text)} characters; a connection request allows {limit}. Shorten the draft.")
    button.click()
    pause(1.0, 1.8)
    dialog = page.locator('[role="dialog"]').last
    try:
        dialog.wait_for(state="visible", timeout=10_000)
    except Exception:
        raise JobFailed("Clicked Connect but no invitation dialog appeared.")

    add_note = first_visible(dialog.locator('button[aria-label="Add a note"]')) or first_visible(
        dialog.get_by_role("button", name=re.compile(r"add a note", re.I))
    )
    if add_note:
        add_note.click()
        pause(0.8, 1.4)
    box = first_visible(page.locator('[role="dialog"] textarea'))
    if not box:
        body = squash(dialog.inner_text())[:200]
        dismiss(page)
        if re.search(r"premium|personalized invit", body, re.I):
            raise JobFailed("LinkedIn would not allow a note on this invitation (out of personalized invitations this month, or Premium required). Nothing was sent.")
        if re.search(r"email", body, re.I):
            raise JobFailed("LinkedIn asks for this person's email address before connecting. Nothing was sent.")
        raise JobFailed(f"No note field in the invitation dialog. Nothing was sent. Dialog said: {body}")

    human_type(page, box, text)
    typed = box.input_value()
    if squash(typed) != squash(text):
        dismiss(page)
        raise JobFailed("The note did not type in cleanly, so it was not sent.")

    if job.get("rehearse"):
        shot(page, job["slug"], "rehearsal-connect")
        dismiss(page)
        return typed

    send = first_visible(page.locator('[role="dialog"] button[aria-label="Send invitation"]')) or first_visible(
        page.locator('[role="dialog"]').get_by_role("button", name=re.compile(r"^send", re.I))
    )
    if not send or not send.is_enabled():
        dismiss(page)
        raise JobFailed("The Send button was missing or disabled. Nothing was sent.")
    state["clicked_send"] = True
    send.click()
    pause(2.0, 3.5)
    if first_visible(page.locator('[role="dialog"] textarea')):
        shot(page, job["slug"], "send-unconfirmed")
        raise JobFailed("Pressed Send but the invitation dialog stayed open. Check the profile on LinkedIn before retrying — it may not have gone.")
    return typed


def dismiss(page):
    for _ in range(2):
        btn = first_visible(page.locator('[role="dialog"] button[aria-label="Dismiss"]'))
        if not btn:
            break
        try:
            btn.click()
            pause(0.5, 1.0)
            discard = first_visible(page.get_by_role("button", name=re.compile(r"^discard", re.I)))
            if discard:
                discard.click()
                pause(0.4, 0.8)
        except Exception:
            break


def send_message(page, job, text, name, state):
    main = page.locator("main")
    button = None
    if name:
        button = first_visible(main.locator(f'button[aria-label="Message {first_name_of(name)}"], button[aria-label="Message {name}"]'))
    button = button or first_visible(main.locator('button[aria-label^="Message"]')) or first_visible(main.locator('a[href*="/messaging/compose"]'))
    if not button:
        raise JobFailed("Connected, but no Message button was found on the profile.")
    button.click()
    pause(1.5, 2.5)
    box = first_visible(page.locator('div.msg-form__contenteditable[contenteditable="true"]'))
    if not box:
        raise JobFailed("The message box did not open (LinkedIn may be showing an InMail or Premium prompt). Nothing was sent.")
    if squash(box.inner_text()):
        raise JobFailed("The message box already holds an unsent draft to this person. Clear it on LinkedIn first. Nothing was sent.")

    human_type(page, box, text)
    typed = box.inner_text()
    if squash(typed) != squash(text):
        clear_box(page, box)
        raise JobFailed("The message did not type in cleanly, so it was not sent.")

    if job.get("rehearse"):
        shot(page, job["slug"], "rehearsal-message")
        clear_box(page, box)
        return text

    send = first_visible(page.locator("button.msg-form__send-button")) or first_visible(
        page.locator("form.msg-form").get_by_role("button", name=re.compile(r"^send$", re.I))
    )
    if not send or not send.is_enabled():
        clear_box(page, box)
        raise JobFailed("The Send button was missing or disabled. Nothing was sent.")
    state["clicked_send"] = True
    send.click()
    pause(2.0, 3.5)
    try:
        if squash(box.inner_text()):
            shot(page, job["slug"], "send-unconfirmed")
            raise JobFailed("Pressed Send but the text is still in the box. Check the conversation on LinkedIn before retrying.")
    except JobFailed:
        raise
    except Exception:
        pass
    return text


def clear_box(page, box):
    try:
        box.click()
        page.keyboard.press("Meta+A" if sys.platform == "darwin" else "Control+A")
        page.keyboard.press("Backspace")
        pause(0.3, 0.6)
    except Exception:
        pass


def run_job(context, job):
    page = context.new_page()
    state = {"clicked_send": False}
    seen = {}
    try:
        page.goto(job["url"], wait_until="domcontentloaded", timeout=45_000)
        pause(2.5, 4.5)
        if walled(page):
            raise SessionExpired()
        if "/404" in page.url or "/in/" not in page.url:
            raise JobFailed(f"That profile did not open (landed on {page.url}).")

        name, headline = read_profile(page)
        if not name:
            if walled(page):
                raise SessionExpired()
            shot(page, job["slug"], "no-name")
            raise JobFailed("Could not read the profile (no name found). LinkedIn may have changed the page; see the screenshot in outreach_logs/.")
        seen = {"fullName": name, "firstName": first_name_of(name), "headline": headline}

        first = (job.get("firstName") or "").strip() if job.get("nameConfirmed") else ""
        first = first or seen["firstName"] or (job.get("firstName") or "").strip()
        text = fill_template(job["message"], first).strip()
        if re.search(r"\{\s*first_?name\s*\}", job["message"], re.I) and not first:
            raise JobFailed("The draft greets {firstName} but no first name could be read. Fill it in and retry.")
        if not text:
            raise JobFailed("The draft is empty.")

        page.mouse.wheel(0, random.randint(200, 500))
        pause(0.8, 1.6)
        page.mouse.wheel(0, -600)
        pause(0.5, 1.0)

        connect = find_connect(page, name)
        if connect:
            sent_text = send_connect(page, job, connect, text, state)
            channel = "connect_note"
        elif first_visible(page.locator('main [aria-label^="Pending"]')):
            raise JobFailed("An invitation to this person is already pending. Nothing was sent.")
        elif is_first_degree(page):
            sent_text = send_message(page, job, text, name, state)
            channel = "message"
        else:
            shot(page, job["slug"], "no-path")
            raise JobFailed("No Connect button and not a 1st-degree connection (the profile may be Follow-only or need InMail). Nothing was sent; screenshot in outreach_logs/.")

        report(job, True, channel=channel, sentText=sent_text, **seen)
        log("ok", "rehearsed" if job.get("rehearse") else "sent", job["slug"], "via", channel)
        return True
    except SessionExpired:
        # Draining: hand the job back and stop. Watching: fail it, so an
        # expired session cannot become a loop of browser launches.
        report(job, False, requeue=not WATCHING, error="LinkedIn asked to sign in again. Run save_session.py on the sending Mac, then press Send once more.")
        raise
    except JobFailed as e:
        report(job, False, error=str(e), **seen)
        log("failed", job["slug"], "-", e)
        return False
    except Exception as e:
        shot(page, job["slug"], "error")
        tail = " It had already pressed Send — check LinkedIn before retrying." if state["clicked_send"] else " Nothing was sent."
        report(job, False, error=f"Unexpected error: {type(e).__name__}: {str(e)[:300]}.{tail}", **seen)
        log("error", job["slug"], "-", repr(e))
        return False
    finally:
        try:
            page.close()
        except Exception:
            pass


# ── Modes ─────────────────────────────────────────────────────────────

def claim():
    return api({"action": "claim"})


def work(watch, headless):
    from playwright.sync_api import sync_playwright

    first = claim()
    if not first.get("job") and not watch:
        log("nothing to do:", first.get("reason"))
        return 0

    with sync_playwright() as p:
        browser = context = None
        pending = first
        empty_polls = 0
        try:
            while True:
                job = pending.get("job")
                if not job:
                    if watch:
                        if context and empty_polls >= 3:
                            save_and_close(browser, context)
                            browser = context = None
                        empty_polls += 1
                        time.sleep(20)
                    else:
                        # One more look, in case something was queued as we finished.
                        if empty_polls >= 1:
                            log("queue empty:", pending.get("reason"))
                            break
                        empty_polls += 1
                        time.sleep(3)
                    pending = claim()
                    continue
                empty_polls = 0
                if not context:
                    try:
                        browser, context = open_browser(p, headless)
                    except SystemExit as e:
                        report(job, False, requeue=True, error=str(e))
                        raise
                    except Exception as e:
                        report(job, False, requeue=True, error=f"The browser would not start: {str(e)[:200]}")
                        raise
                log("working", job["slug"], "(rehearsal)" if job.get("rehearse") else "")
                sent = run_job(context, job)
                pending = claim()
                if pending.get("job"):
                    # Space real sends out like a person would.
                    pause(25, 70) if (sent and not job.get("rehearse")) else pause(4, 9)
        except SessionExpired:
            log("session expired — stopping")
            if watch:
                save_and_close(browser, context, keep=False)
                browser = context = None
                time.sleep(1800)  # launchd restarts us; do not hammer LinkedIn meanwhile
            return 2
        finally:
            save_and_close(browser, context, keep=False)
    return 0


def save_and_close(browser, context, keep=True):
    if context:
        if keep:
            try:
                context.storage_state(path=str(session_file()))  # keep rotated cookies fresh
            except Exception:
                pass
        try:
            context.close()
        except Exception:
            pass
    if browser:
        try:
            browser.close()
        except Exception:
            pass


def check(headless):
    from playwright.sync_api import sync_playwright

    with sync_playwright() as p:
        browser, context = open_browser(p, headless)
        page = context.new_page()
        page.goto("https://www.linkedin.com/feed/", wait_until="domcontentloaded", timeout=45_000)
        time.sleep(4)
        ok = not walled(page)
        print("session OK — signed in" if ok else f"session EXPIRED — landed on {page.url}; run save_session.py")
        context.close()
        browser.close()
        return 0 if ok else 2


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    mode = ap.add_mutually_exclusive_group(required=True)
    mode.add_argument("--drain", action="store_true")
    mode.add_argument("--watch", action="store_true")
    mode.add_argument("--check", action="store_true")
    ap.add_argument("--headless", action="store_true", help="no visible window (LinkedIn is likelier to challenge this)")
    args = ap.parse_args()
    if args.check:
        return check(args.headless)
    global WATCHING
    WATCHING = args.watch
    return work(args.watch, args.headless)


if __name__ == "__main__":
    sys.exit(main())
