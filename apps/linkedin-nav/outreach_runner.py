#!/usr/bin/env python3
"""
LinkedIn outreach runner — the hands behind the Allocator's /linkedin page.

The page is a queue: each person the reader presses Send on becomes a job.
This script claims jobs from the Allocator's API one at a time, opens the
profile in a real browser using the saved LinkedIn session, sends the
message through Sales Navigator, and reports back exactly what it typed:

    1. opens the person's LinkedIn profile and reads their name
    2. follows "View in Sales Navigator" (under More) to their lead page
    3. Message -> subject + body -> Send

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

LOGIN_MARKERS = ("/login", "/authwall", "/checkpoint", "/uas/", "/signup", "/sales/contract-chooser")
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
    # focus(), not click(): Sales Navigator floats a "create draft" hint over
    # its empty message box that swallows clicks.
    target.focus()
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
    if not name or len(name) > 80:
        # The profile markup shifts often; the tab title is steadier.
        title = re.sub(r"^\(\d+\+?\)\s*", "", squash(page.title()))
        name = squash(title.split("|")[0]) if "|" in title else name
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


def sales_nav_url(page, slug):
    """The lead's Sales Navigator address, read off their LinkedIn profile:
    the "View in Sales Navigator" entry under More."""
    link = first_visible(page.locator('a[href*="/sales/people/"], a[href*="/sales/lead/"]'))
    if not link:
        main = page.locator("main")
        more = (
            first_visible(main.get_by_role("button", name=re.compile(r"^More( actions)?$")))
            or first_visible(main.locator('button[aria-label="More actions"]'))
        )
        if more:
            more.click()
            pause(0.9, 1.5)
            link = first_visible(page.get_by_role("link", name=re.compile(r"view in sales navigator", re.I))) or first_visible(
                page.locator('a[href*="/sales/people/"], a[href*="/sales/lead/"]')
            )
    href = None
    if link:
        href = link.get_attribute("href")
        page.keyboard.press("Escape")
        pause(0.3, 0.6)
    if not href:
        # Last resort: the address is sometimes in the page source.
        m = re.search(r'https://www\.linkedin\.com/sales/(?:people|lead)/[A-Za-z0-9_\-]+,[A-Za-z0-9_\-,]*', page.content())
        href = m.group(0) if m else None
    if not href:
        shot(page, slug, "no-sales-nav-link")
        raise JobFailed("No \"View in Sales Navigator\" link on the profile. Nothing was sent; screenshot in outreach_logs/.")
    return href if href.startswith("http") else "https://www.linkedin.com" + href


def close_compose(page):
    try:
        close = first_visible(page.locator('button[data-control-name="overlay.close_overlay"]'))
        if close:
            close.click()
            pause(0.5, 1.0)
            discard = first_visible(page.get_by_role("button", name=re.compile(r"^(discard|delete)", re.I)))
            if discard:
                discard.click()
                pause(0.4, 0.8)
    except Exception:
        pass


def clear_field(page, field):
    try:
        field.fill("")
        pause(0.2, 0.4)
    except Exception:
        pass


def send_sales_nav(page, job, subject, text, name, state):
    """On the lead's Sales Navigator page: Message, subject, body, Send.
    Anything that goes wrong before Send leaves the box empty and closed."""
    try:
        return _send_sales_nav(page, job, subject, text, name, state)
    except (JobFailed, SessionExpired):
        raise
    except Exception:
        if not state["clicked_send"]:
            for sel in ('form textarea[name="message"]', 'form input[aria-label^="Subject"]'):
                field = first_visible(page.locator(sel))
                if field:
                    clear_field(page, field)
            close_compose(page)
        raise


def _send_sales_nav(page, job, subject, text, name, state):
    limit = int(job.get("noteLimit") or 1900)
    if len(text) > limit:
        raise JobFailed(f"The message is {len(text)} characters; Sales Navigator allows {limit}. Shorten the draft.")

    button = page.locator("button[data-anchor-send-inmail]").first
    try:
        button.wait_for(state="visible", timeout=20_000)
    except Exception:
        if walled(page):
            raise SessionExpired()
        shot(page, job["slug"], "no-message-button")
        raise JobFailed("The Sales Navigator page has no Message button for this person. Nothing was sent; screenshot in outreach_logs/.")

    # Be sure this is the person we came for before typing anything.
    title = squash(page.title())
    if name and first_name_of(name).lower() not in title.lower():
        shot(page, job["slug"], "wrong-lead")
        raise JobFailed(f"Sales Navigator opened \"{title}\", not {name}. Nothing was sent.")

    button.click()
    box = page.locator('form textarea[name="message"]').first
    try:
        box.wait_for(state="visible", timeout=15_000)
    except Exception:
        shot(page, job["slug"], "no-compose")
        raise JobFailed("The Sales Navigator message box did not open (out of InMail credits, or they do not accept messages). Nothing was sent.")
    pause(1.0, 1.8)

    if squash(box.input_value()):
        close_compose(page)
        raise JobFailed("Sales Navigator already holds an unsent draft to this person. Clear it there first. Nothing was sent.")

    subject_box = first_visible(page.locator('form input[aria-label^="Subject"], form input[placeholder^="Subject"]'))
    typed_subject = ""
    if subject_box:
        if not subject:
            close_compose(page)
            raise JobFailed("Sales Navigator requires a subject and the draft has none. Nothing was sent.")
        clear_field(page, subject_box)  # a subject alone is a leftover, not a draft
        human_type(page, subject_box, subject)
        typed_subject = subject_box.input_value()
        if squash(typed_subject) != squash(subject):
            clear_field(page, subject_box)
            close_compose(page)
            raise JobFailed("The subject did not type in cleanly, so nothing was sent.")
    # No subject field means an existing conversation: the body goes as a reply.

    human_type(page, box, text)
    typed = box.input_value()
    if squash(typed) != squash(text):
        clear_field(page, box)
        if subject_box:
            clear_field(page, subject_box)
        close_compose(page)
        raise JobFailed("The message did not type in cleanly, so it was not sent.")

    # Sales Navigator shows "Name · 2nd / headline" beside the box.
    try:
        card = first_visible(page.locator('a[data-control-name="view_profile"]'))
        lines = [squash(x) for x in (card.inner_text() if card else "").split("\n") if squash(x)]
        lines = [x for x in lines if x != name and not x.startswith("·")]
        if lines:
            state["headline"] = lines[0][:300]
    except Exception:
        pass

    if job.get("rehearse"):
        shot(page, job["slug"], "rehearsal-sales-nav")
        clear_field(page, box)
        if subject_box:
            clear_field(page, subject_box)
        close_compose(page)
        return typed_subject, typed

    send = first_visible(page.locator("form").get_by_role("button", name=re.compile(r"^send$", re.I)))
    if not send or not send.is_enabled():
        shot(page, job["slug"], "send-disabled")
        clear_field(page, box)
        if subject_box:
            clear_field(page, subject_box)
        close_compose(page)
        raise JobFailed("Sales Navigator's Send button was missing or disabled (often: no InMail credits left). Nothing was sent.")
    state["clicked_send"] = True
    send.click()
    pause(2.5, 4.0)
    try:
        if box.is_visible() and squash(box.input_value()) == squash(text):
            shot(page, job["slug"], "send-unconfirmed")
            raise JobFailed("Pressed Send but the text is still in the box. Check Sales Navigator's inbox before retrying.")
    except JobFailed:
        raise
    except Exception:
        pass
    shot(page, job["slug"], "sent")
    return typed_subject, typed


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

        subject = fill_template(job.get("subject") or "", first).strip()
        lead_url = sales_nav_url(page, job["slug"])
        pause(0.8, 1.6)
        page.goto(lead_url, wait_until="domcontentloaded", timeout=45_000)
        pause(3.0, 5.0)
        if walled(page) or "/sales/" not in page.url:
            raise SessionExpired()
        sent_subject, sent_text = send_sales_nav(page, job, subject, text, name, state)
        if state.get("headline"):
            seen["headline"] = state["headline"]
        channel = "sales_nav"

        report(job, True, channel=channel, sentText=sent_text, sentSubject=sent_subject, **seen)
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
