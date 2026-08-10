#!/usr/bin/env python3
"""
ig_data.py  - Instagram account stats [STANDALONE PC]
======================================================
For each handle, returns:
  - followers
  - following
  - total_posts
  - avg_likes      (average over recent ~12 posts)
  - avg_comments   (average over recent ~12 posts)
  - video_reel_pct (% of the sampled recent posts that are video/reel)

Uses a logged-in IG session cookie from .env.local (IG_SESSIONID=...). Free,
no Graph API. NOTE: this hits Instagram's private/undocumented endpoints
using a real logged-in session — that's against Instagram's Terms of
Service and carries real checkpoint/ban risk on the account whose session
you use. Use a throwaway/secondary account if you can, and keep the daily
volume modest.

OUTPUT:
  stats.csv        (one row per account)
  stats.json       (same data, JSON array — this is what the report app's
                    "Import from stats.json" button on the Instagram tab
                    reads to prefill a report)

USAGE:
  python ig_data.py --file ids.txt
  python ig_data.py --file ids.txt --daily 50
  python ig_data.py handle1 handle2
  python ig_data.py --self-test

ENV (.env.local in this folder — same file the Next.js app uses):
  IG_SESSIONID=your_sessionid_cookie_value
"""
import os
import sys
import json
import csv
import re
import random
import datetime
import asyncio

HERE = os.path.dirname(os.path.abspath(__file__))
ENV_FILE = os.path.join(HERE, ".env.local")
STATS_CSV = os.path.join(HERE, "stats.csv")
STATS_JSON = os.path.join(HERE, "stats.json")

MIN_DELAY, MAX_DELAY = 4, 8
POSTS_LIMIT = 12  # avg over recent ~12 posts


# ---------- session ----------
def load_session():
    if os.environ.get("IG_SESSIONID"):
        return os.environ["IG_SESSIONID"]
    if os.path.exists(ENV_FILE):
        for line in open(ENV_FILE):
            line = line.strip()
            if line and not line.startswith("#") and line.startswith("IG_SESSIONID"):
                _, _, val = line.partition("=")
                return val.strip().strip('"').strip("'")
    return None


# ---------- browser fetch ----------
# All calls run via page.evaluate() so they inherit the instagram.com origin
# and session cookie. Endpoint choice matters: the older
# /users/web_profile_info/?username= endpoint currently 400s for BUSINESS
# accounts ("Asset asset://laser.provider/ig_business_category_subvertical
# has been deleted"), which is most brands this tool targets. Resolving the
# numeric user id from the profile page and using /users/<id>/info/ works
# for both business and personal accounts.
API_JS = """
async (url) => {
    const r = await fetch(url, {headers: {"X-IG-App-ID": "936619743392459", "X-Requested-With": "XMLHttpRequest"}});
    const t = await r.text();
    let j = null;
    try { j = JSON.parse(t); } catch (e) {}
    return {status: r.status, json: j, head: t.slice(0, 200)};
}
"""

USER_ID_PATTERNS = [
    r'"profile_id":"(\d+)"',
    r'"user_id":"(\d+)"',
    r'profilePage_(\d+)',
]


async def resolve_user_id(page, username):
    await page.goto(f"https://www.instagram.com/{username}/", wait_until="domcontentloaded", timeout=45000)
    html = await page.content()
    for pat in USER_ID_PATTERNS:
        m = re.search(pat, html)
        if m:
            return m.group(1)
    if "Sorry, this page isn't available" in html or "page isn&#039;t available" in html:
        raise RuntimeError(f"profile '{username}' not found")
    raise RuntimeError("could not resolve user id (login wall / blocked / layout changed)")


async def fetch_profile(page, username):
    uid = await resolve_user_id(page, username)
    out = await page.evaluate(API_JS, f"https://www.instagram.com/api/v1/users/{uid}/info/")
    if out["status"] != 200 or not out["json"]:
        raise RuntimeError(f"profile info HTTP {out['status']}: {out['head'][:120]}")
    user = out["json"].get("user")
    if not user:
        raise RuntimeError("profile info returned no user object")
    user["_uid"] = uid
    user.setdefault("username", username)
    return user


async def fetch_posts(page, user_id, limit=POSTS_LIMIT):
    out = await page.evaluate(API_JS, f"https://www.instagram.com/api/v1/feed/user/{user_id}/?count={limit}")
    if out["status"] != 200 or not out["json"]:
        raise RuntimeError(f"feed HTTP {out['status']}: {out['head'][:120]}")
    return (out["json"].get("items") or [])[:limit]


# media_type 2 is video; product_type "clips" is a Reel. Carousels
# (media_type 8) are counted as photo unless IG marks them otherwise.
def is_video_post(item):
    return item.get("media_type") == 2 or item.get("product_type") == "clips"


def avg(nums):
    nums = [n for n in nums if n is not None]
    return round(sum(nums) / len(nums)) if nums else 0


# ---------- run ----------
async def run(users, daily_cap=None):
    from playwright.async_api import async_playwright

    session = load_session()
    if not session:
        print(f"ERROR: no IG_SESSIONID in {ENV_FILE}.", flush=True)
        sys.exit(1)

    results = []
    ok = 0
    failed = []
    start = datetime.datetime.now(datetime.timezone.utc)

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        ctx = await browser.new_context(locale="en-US")
        await ctx.add_cookies([{
            "name": "sessionid", "value": session,
            "domain": ".instagram.com", "path": "/", "secure": True, "httpOnly": True,
        }])
        page = await ctx.new_page()

        # The per-profile fetches below run via page.evaluate(), so the page
        # must already be ON instagram.com — a fetch() issued from about:blank
        # is cross-origin, sends no session cookie, and fails every time
        # (which then fell through to the HTML fallback and reported a bogus
        # "login wall / not found / blocked"). Land on the origin once here.
        await page.goto("https://www.instagram.com/", wait_until="domcontentloaded", timeout=30000)

        for u in users:
            if daily_cap and ok >= daily_cap:
                print(f"[cap] reached daily limit {daily_cap}, stopping.", flush=True)
                break
            try:
                user = await fetch_profile(page, u)
                followers = user.get("follower_count")
                following = user.get("following_count")
                total_posts = user.get("media_count")
                uid = user.get("_uid")
                likes, comments, video_flags, timestamps = [], [], [], []
                if uid and not user.get("is_private"):
                    try:
                        posts = await fetch_posts(page, uid, POSTS_LIMIT)
                        for ps in posts:
                            likes.append(ps.get("like_count"))
                            comments.append(ps.get("comment_count"))
                            video_flags.append(is_video_post(ps))
                            if ps.get("taken_at"):
                                timestamps.append(ps["taken_at"])
                    except Exception as pe:
                        print(f"  posts failed for {u}: {pe}", flush=True)

                video_reel_pct = round(100 * sum(video_flags) / len(video_flags), 1) if video_flags else None

                # Posts/week across the sampled window (epoch seconds).
                posts_per_week = None
                if len(timestamps) >= 2:
                    span_days = max((max(timestamps) - min(timestamps)) / 86400, 1)
                    posts_per_week = round((len(timestamps) - 1) / span_days * 7, 2)

                rec = {
                    "username": user.get("username"),
                    "followers": followers,
                    "following": following,
                    "total_posts": total_posts,
                    "avg_likes": avg(likes),
                    "avg_comments": avg(comments),
                    "video_reel_pct": video_reel_pct,
                    "posts_per_week": posts_per_week,
                    "sampled_post_count": len(video_flags),
                    "scraped_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
                }
                results.append(rec)
                ok += 1
                print(
                    f"OK {u} - fol:{followers} posts:{total_posts} avgL:{rec['avg_likes']} "
                    f"avgC:{rec['avg_comments']} vid%:{video_reel_pct} ppw:{posts_per_week} ({ok}/{len(users)})",
                    flush=True,
                )
            except Exception as e:
                failed.append((u, str(e)))
                print(f"ERR {u} - {e}", flush=True)
            await asyncio.sleep(random.uniform(MIN_DELAY, MAX_DELAY))
        await browser.close()

    # save
    json.dump(results, open(STATS_JSON, "w"), indent=2, ensure_ascii=False)
    with open(STATS_CSV, "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["username", "followers", "following", "total_posts", "avg_likes", "avg_comments", "video_reel_pct", "posts_per_week", "sampled_post_count"])
        for r in results:
            w.writerow([
                r["username"], r["followers"], r["following"], r["total_posts"],
                r["avg_likes"], r["avg_comments"], r["video_reel_pct"],
                r["posts_per_week"], r["sampled_post_count"],
            ])

    dur = (datetime.datetime.now(datetime.timezone.utc) - start).total_seconds()
    print(f"\nSaved {ok} accounts -> stats.csv, stats.json (duration {dur:.0f}s)", flush=True)
    if failed:
        print(f"{len(failed)} failed:", ", ".join(u for u, _ in failed))


# ---------- helpers ----------
def read_file_list(path):
    return [l.strip().lstrip("@") for l in open(path) if l.strip() and not l.startswith("--")]


def self_test():
    print("=== SELF TEST ===")
    print(f"IG_SESSIONID loaded from {ENV_FILE}:", bool(load_session()))
    try:
        from playwright.async_api import async_playwright
        print("playwright OK")
    except Exception as e:
        print("playwright NOT installed:", e); sys.exit(1)
    print("Self test done.")


# ---------- main ----------
def main():
    args = sys.argv[1:]
    if not args or "--self-test" in args:
        if "--self-test" in args:
            self_test(); sys.exit(0)
        print(__doc__); sys.exit(1)

    users, daily = [], None
    i = 0
    while i < len(args):
        a = args[i]
        if a == "--file":
            users += read_file_list(args[i+1]); i += 2
        elif a == "--daily":
            daily = int(args[i+1]); i += 2
        else:
            users.append(a.lstrip("@")); i += 1

    users = list(dict.fromkeys([u for u in users if u]))
    if not users:
        print("ERROR: no usernames. Use --file ids.txt or list them.")
        sys.exit(1)
    try:
        asyncio.run(run(users, daily))
    except Exception as e:
        print("FATAL:", repr(e), flush=True)
        import traceback; traceback.print_exc()


if __name__ == "__main__":
    main()
