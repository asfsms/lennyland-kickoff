#!/usr/bin/env python3
"""Play one game start to finish in a real browser and check its content.

Usage:  python3 automation/check.py 002 [--passcode "Silly Passcode Here"] [--out /tmp/shots]

It serves the repository on localhost, then:
  A. iPad portrait, on the game's own day: misses first, then scores on the rebound; finishes early once to see the locked vault.
  B. iPad landscape, on the game's own day: everything right first time; then checks the home page.
  C. Phone width, two days later: a replay (no daily passcode).
  D. The day before: the game must not open.
  E. Weekend passcode on the home page (when this week has one).
It prints PASS or FAIL with a list of problems, and saves a screenshot of every page to --out.
Exit code 0 only on PASS.
"""
import argparse, base64, datetime, functools, http.server, json, os, re, socket, sys, threading

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
problems, notes = [], []


def bad(msg):
    problems.append(msg)


def serve():
    s = socket.socket(); s.bind(("127.0.0.1", 0)); port = s.getsockname()[1]; s.close()
    class Quiet(http.server.SimpleHTTPRequestHandler):
        def log_message(self, *a, **k): pass
    handler = functools.partial(Quiet, directory=ROOT)
    httpd = http.server.ThreadingHTTPServer(("127.0.0.1", port), handler)
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    return httpd, f"http://localhost:{port}"


def decode(enc):
    try:
        return base64.b64decode(enc).decode("utf-8")[::-1]
    except Exception:
        return ""


def words(t):
    t = re.sub(r"\{([^|{}]+)\|[^{}]+\}", r"\1", t or "")
    return len(re.findall(r"[A-Za-z0-9'’.,-]+", t.replace("**", "")))


EMOJI = re.compile("[\U0001F000-\U0001FAFF☀-➿]")


def lint(G, scenes, toys, entry, data, nnn, passcode):
    if G.get("n") != int(nnn): bad(f"GAME.n is {G.get('n')}, folder is {nnn}")
    if G.get("code") != f"LDK-{nnn}": bad(f"GAME.code should be LDK-{nnn}")
    try:
        d = datetime.date.fromisoformat(G.get("date", ""))
        if d.weekday() > 4 and int(nnn) != 1: bad("GAME.date is not a weekday")
        iso = d.isocalendar(); wk = f"{iso[0]}-W{iso[1]:02d}"
        if G.get("week") != wk: bad(f"GAME.week should be {wk}")
    except ValueError:
        bad("GAME.date is not YYYY-MM-DD")
    if not G.get("title") or len(G["title"]) > 44: bad("title missing or longer than 44 characters")
    for k in ("n", "code", "date", "week", "title", "pw"):
        if entry.get(k) != G.get(k): bad(f"editions.json entry and GAME disagree on '{k}'")
    for k in ("theme", "topic", "riddle", "golden", "path"):
        if not entry.get(k): bad(f"editions.json entry is missing '{k}'")
    pages = G.get("pages") or []
    if len(pages) != 10: bad(f"pages must have exactly 10 story pages, found {len(pages)}")
    if not any(p.get("toy") for p in pages[:5]): bad("the first half needs one page with a toy")
    if not any(p.get("toy") for p in pages[5:]): bad("the second half needs one page with a toy")
    if sum(1 for p in pages if p.get("guessBack")) != 1: bad("exactly one page must have guessBack: true")
    total = words(G.get("lede")) + words((G.get("riddle") or {}).get("q"))
    for i, p in enumerate(pages):
        w = words(p.get("text")); total += w + words(p.get("bonus"))
        if w > 45: bad(f"story page {i + 1} has {w} words (limit 45)")
        if w < 8: bad(f"story page {i + 1} has only {w} words")
        if p.get("toy") and p["toy"] not in toys: bad(f"story page {i + 1}: toy '{p['toy']}' is not defined in TOYS")
        if p.get("scene") and p["scene"] not in scenes: bad(f"story page {i + 1}: scene '{p['scene']}' is not defined in SCENES")
        if not p.get("toy") and not p.get("scene"): bad(f"story page {i + 1} has no picture and no toy")
        for field in ("text", "bonus"):
            if EMOJI.search(p.get(field) or ""): bad(f"story page {i + 1} has an emoji in its text")
    if not 230 <= total <= 380: bad(f"story is {total} words; keep it between 230 and 380")
    notes.append(f"story words: {total}")
    g = G.get("guess") or {}
    if not isinstance(g.get("answer"), int) or not g.get("q"): bad("guess needs a question and a whole-number answer")
    else:
        gb = next((i for i, p in enumerate(pages) if p.get("guessBack")), 9)
        early = " ".join([G.get("title", ""), G.get("lede", "")] + [p.get("text", "") for p in pages[:gb]])
        if re.search(r"(?<![\d,])" + re.escape(f"{g['answer']:,}") + r"(?![\d,])", early) or re.search(r"(?<!\d)" + str(g["answer"]) + r"(?!\d)", early):
            bad("the guess answer appears in the title, the opening or a page before the reveal")
    r = G.get("riddle") or {}
    if not all(r.get(k) for k in ("q", "accept", "answer", "hint", "explain")): bad("riddle is missing a field")
    elif not any(str(a).lower() in r["answer"].lower() for a in r["accept"]): bad("riddle.answer would not be accepted by riddle.accept")
    sh = G.get("shots") or {}
    for k in ("1", "2"):
        s = sh.get(k) or {}
        if len(s.get("opts") or []) != 4 or s.get("a") not in (0, 1, 2, 3) or not all(s.get(x) for x in ("q", "hint", "fb")): bad(f"shot {k} needs a question, 4 options, a, hint and fb")
    if (sh.get("1") or {}).get("a") == (sh.get("2") or {}).get("a"): notes.append("shots 1 and 2 have the right answer in the same position; better to vary it")
    o = sh.get("order") or {}
    if not 3 <= len(o.get("cards") or []) <= 5 or not all(o.get(x) for x in ("q", "hint", "fb")): bad("order shot needs 3 to 5 cards, q, hint and fb")
    for k in ("math", "golden"):
        s = sh.get(k) or {}
        if not isinstance(s.get("answer"), int) or not all(s.get(x) for x in ("q", "hint", "fb")): bad(f"{k} shot needs q, a whole-number answer, hint and fb")
    c = sh.get("coach") or {}
    if len(c.get("rubric") or []) != 3 or len(c.get("ideas") or []) != 2 or len(c.get("model") or "") < 40 or not c.get("q"): bad("coach shot needs q, 2 ideas, 3 rubric lines and a model answer")
    if len(G.get("dinner") or []) != 3: bad("dinner needs exactly 3 facts")
    if len(G.get("sources") or []) < 2 or not all(str(s.get("u", "")).startswith("https://") and s.get("t") for s in G.get("sources") or []): bad("sources needs at least 2 entries with https links")
    if not G.get("notes"): bad("notes (for grown-ups) is empty")
    if not 3 <= len(G.get("chips") or []) <= 5 or len(G.get("helperQA") or []) != 2: bad("chips needs 3 to 5 entries and helperQA exactly 2")
    if len(G.get("lesson") or "") < 200: bad("lesson (the helper's summary of the story) is too short")
    pw = decode(G.get("pw", ""))
    if not 2 <= len(pw.split()) <= 5: bad("passcode must decode to 2 to 5 words")
    if passcode and pw != passcode: bad("the encoded passcode does not match --passcode")
    for e in data.get("editions", []):
        if e.get("n") != G.get("n") and e.get("pw") == G.get("pw"): bad(f"passcode repeats game {e.get('n')}")
        if e.get("n") != G.get("n") and (e.get("title") or "").strip().lower() == (G.get("title") or "").strip().lower(): bad(f"title repeats game {e.get('n')}")
    return pw


def main():
    ap = argparse.ArgumentParser(); ap.add_argument("nnn"); ap.add_argument("--passcode"); ap.add_argument("--out", default="/tmp/kickoff-check")
    a = ap.parse_args(); nnn = a.nnn.zfill(3); os.makedirs(a.out, exist_ok=True)
    data = json.load(open(os.path.join(ROOT, "editions.json"), encoding="utf-8"))
    entry = next((e for e in data.get("editions", []) if e.get("n") == int(nnn)), None)
    if not entry: print("FAIL\n- editions.json has no entry for game", nnn); sys.exit(1)
    if not os.path.exists(os.path.join(ROOT, "e", nnn, "index.html")): print("FAIL\n- e/%s/index.html is missing" % nnn); sys.exit(1)
    from playwright.sync_api import sync_playwright
    httpd, base = serve()
    day = datetime.date.fromisoformat(entry["date"])
    url = lambda today, extra="": f"{base}/e/{nnn}/index.html?today={today}{extra}"

    def watch(pg, tag):
        pg.on("pageerror", lambda e: bad(f"[{tag}] script error: {e}"))
        pg.on("console", lambda m: bad(f"[{tag}] console error: {m.text}") if m.type == "error" and "fonts.g" not in m.text and "ERR_" not in m.text and "favicon" not in m.text else None)

    def overflow(pg, tag, label):
        w = pg.evaluate("document.documentElement.scrollWidth - document.documentElement.clientWidth")
        if w > 1: bad(f"[{tag}] page {label} is {w}px wider than the screen")

    def snap(pg, tag, name):
        pg.wait_for_timeout(550); pg.screenshot(path=os.path.join(a.out, f"{tag}-{name}.png"), full_page=True)

    def play(pg, tag, G, perfect, shots=True):
        """Walk the 14 pages. perfect=False misses once wherever a miss is possible."""
        step = lambda n: f'.step[data-step="{n}"]'
        if pg.is_visible("#newPlayer"):
            pg.fill("#pName", "Tester"); pg.click('#swB .sw[title="Black"]'); pg.click("#joinBtn")
        else:
            pg.click("#playerList .track")
        if shots: snap(pg, tag, "00")
        overflow(pg, tag, 0); pg.click("#startBtn")
        if not pg.is_disabled("#next-1"): bad(f"[{tag}] page 1: Next is open before the guess")
        pg.fill("#guessIn", str(G["guess"]["answer"] + (0 if perfect else 2))); pg.click("#guessBtn")
        if shots: snap(pg, tag, "01")
        overflow(pg, tag, 1); pg.click("#next-1")
        for n in list(range(2, 13)):
            if not pg.is_visible(step(n)): bad(f"[{tag}] page {n} did not open"); return None
            if n == 7:
                if not perfect:
                    pg.fill("#riddleIn", "zzzz"); pg.click("#riddleBtn")
                    if not pg.is_disabled("#next-7"): bad(f"[{tag}] riddle: Next opened after one wrong answer")
                pg.fill("#riddleIn", G["riddle"]["answer"]); pg.click("#riddleBtn")
                if "Yes!" not in pg.inner_text("#riddleFb"): bad(f"[{tag}] riddle: the right answer was not accepted")
            else:
                i = n - 2 if n < 7 else n - 3; p = G["pages"][i]
                if p.get("toy"):
                    if not pg.is_disabled(f"#next-{n}"): bad(f"[{tag}] page {n}: Next is open before the toy is used")
                    if shots: snap(pg, tag, f"{n:02d}a")
                    for _ in range(80):
                        if pg.is_enabled(f"#next-{n}"): break
                        btn = pg.locator(f"{step(n)} .toybtn:not([disabled])").first
                        if btn.count() == 0: break
                        btn.click(); pg.wait_for_timeout(60)
                    if pg.is_disabled(f"#next-{n}") and not p.get("quick"): bad(f"[{tag}] page {n}: tapping the toy buttons never finished the toy")
                if p.get("quick"):
                    q = p["quick"]
                    if not perfect:
                        pg.fill(f"#qcIn-{n}", str(q["answer"] + 1)); pg.click(f"#qcBtn-{n}")
                    pg.fill(f"#qcIn-{n}", str(q["answer"])); pg.click(f"#qcBtn-{n}")
                    if pg.is_disabled(f"#next-{n}"): bad(f"[{tag}] page {n}: quick check right answer did not open Next")
                if p.get("guessBack") and "guessed" not in pg.inner_text("#guessBack"): bad(f"[{tag}] page {n}: the guess reveal is missing")
            if shots: snap(pg, tag, f"{n:02d}")
            overflow(pg, tag, n)
            if pg.is_disabled(f"#next-{n}"): bad(f"[{tag}] page {n}: cannot go on"); return None
            pg.click(f"#next-{n}")
        sh = G["shots"]
        if not perfect:
            pg.click("#finishBtn")
            if pg.locator("#vault .pw").count() or "locked" not in pg.inner_text("#vaultTitle").lower(): bad(f"[{tag}] the vault opened before the shootout was finished")
            pg.click("#vaultBody .btn")
        for k in ("1", "2"):
            right = sh[k]["a"]
            if not perfect: pg.click(f'#shot{k} .opt[data-i="{(right + 1) % 4}"]')
            pg.click(f'#shot{k} .opt[data-i="{right}"]')
            want = "GOAL" if perfect else "rebound"
            if want.lower() not in pg.inner_text(f"#shot{k} .fb").lower(): bad(f"[{tag}] shot {k}: expected '{want}'")
        n = len(sh["order"]["cards"])
        if not perfect:
            for i in reversed(range(n)): pg.click(f'#order .card[data-id="{i}"]')
            pg.click("#orderCheck")
        for i in range(n): pg.click(f'#order .card[data-id="{i}"]')
        pg.click("#orderCheck")
        if ("GOAL" if perfect else "rebound").lower() not in pg.inner_text("#orderFb").lower(): bad(f"[{tag}] shot 3 (order) did not score")
        if not perfect: pg.fill("#mathIn", str(sh["math"]["answer"] + 1)); pg.click("#mathBtn")
        pg.fill("#mathIn", str(sh["math"]["answer"])); pg.click("#mathBtn")
        if not perfect:
            pg.fill("#coachIn", "ok"); pg.click("#coachBtn")
            if "full sentences" not in pg.inner_text("#coachFb"): bad(f"[{tag}] coach: a one-word answer was accepted")
        pg.fill("#coachIn", sh["coach"]["model"]); pg.click("#coachBtn"); pg.wait_for_timeout(400)
        boxes = pg.locator("#coachFb input[type=checkbox]")
        if boxes.count() != 3: bad(f"[{tag}] coach: the self-check did not appear")
        for b in boxes.all(): b.check()
        if not perfect: pg.fill("#goldIn", str(sh["golden"]["answer"] + 1)); pg.click("#goldBtn")
        pg.fill("#goldIn", str(sh["golden"]["answer"])); pg.click("#goldBtn")
        if "GOLDEN GOAL" not in pg.inner_text("#goldFb"): bad(f"[{tag}] Golden Goal right answer was not accepted")
        if shots: snap(pg, tag, "13")
        overflow(pg, tag, 13)
        pg.click("#finishBtn"); pg.wait_for_timeout(900)
        if shots: snap(pg, tag, "14")
        overflow(pg, tag, 14)
        # rate the game: stars, then one follow-up question that depends on the stars
        if not pg.is_visible("#rate"): bad(f"[{tag}] the rating panel is missing after a finished game")
        else:
            pg.click("#rate .rate-stars button >> nth=1")
            if "could be better" not in pg.inner_text("#rate").lower(): bad(f"[{tag}] 2 stars did not ask what could be better")
            pg.click("#rate .rate-stars button >> nth=4")
            if "like best" not in pg.inner_text("#rate").lower(): bad(f"[{tag}] 5 stars did not ask what the player liked")
            if pg.locator("#rate .rate-stars button.on").count() != 5: bad(f"[{tag}] 5 stars are not all lit")
            pg.click("#rate .pick >> nth=0")
            saved = pg.evaluate("code => { const d=JSON.parse(localStorage.getItem('ldk-v1')); const p=d.players[d.last]; return (p.history[code]||{}).rating || null; }", G["code"])
            if not saved or saved.get("stars") != 5 or saved.get("why") != "story": bad(f"[{tag}] the rating was not saved with the result")
            if shots: snap(pg, tag, "14-rated")
        return {"goals": pg.inner_text("#ringTxt"), "pw": pg.inner_text("#vault .pw") if pg.locator("#vault .pw").count() else "", "vault": pg.inner_text("#vaultTitle")}

    with sync_playwright() as p:
        b = p.chromium.launch()
        # A: iPad portrait, own day, rebound path
        ctx = b.new_context(viewport={"width": 820, "height": 1180}); pg = ctx.new_page(); watch(pg, "A")
        pg.goto(url(day)); pg.wait_for_timeout(500)
        G = pg.evaluate("JSON.parse(JSON.stringify(window.GAME))")
        scenes = pg.evaluate("Object.keys(window.SCENES||{})"); toys = pg.evaluate("Object.keys(window.TOYS||{})")
        pw = lint(G, scenes, toys, entry, data, nnn, a.passcode)
        if problems:
            print("FAIL (content rules; fix these before the browser run)\n- " + "\n- ".join(problems)); sys.exit(1)
        ra = play(pg, "A", G, perfect=False)
        if ra:
            if ra["pw"] != pw: bad("[A] the vault did not show the passcode on the game's own day")
            if ra["goals"] != "4": bad(f"[A] expected 4 goals on the rebound path (coach talk 1 + finishing 1 + Golden Goal 2), got {ra['goals']}")
        ctx.close()
        # B: iPad landscape, own day, perfect; then the home page
        ctx = b.new_context(viewport={"width": 1180, "height": 820}); pg = ctx.new_page(); watch(pg, "B")
        pg.goto(url(day)); pg.wait_for_timeout(400)
        rb = play(pg, "B", G, perfect=True)
        if rb:
            if rb["pw"] != pw: bad("[B] the vault did not show the passcode")
            if rb["goals"] != "8": bad(f"[B] expected 8 goals for a perfect game, got {rb['goals']}")
        pg.goto(f"{base}/?today={day}"); pg.wait_for_timeout(600)
        if "finished today" not in pg.inner_text("#hub").lower(): bad("[B] the home page does not show today's game as finished")
        if G["title"] not in pg.inner_text("#hub"): bad("[B] the home page does not show today's title")
        snap(pg, "B", "home"); overflow(pg, "B", "home")
        ctx.close()
        # C: phone, two days later = replay
        ctx = b.new_context(viewport={"width": 390, "height": 844}); pg = ctx.new_page(); watch(pg, "C")
        pg.goto(url(day + datetime.timedelta(days=2))); pg.wait_for_timeout(400)
        rc = play(pg, "C", G, perfect=True, shots=False)
        if rc:
            if rc["pw"]: bad("[C] a replay showed the daily passcode")
            if "replay" not in rc["vault"].lower(): bad("[C] the replay message is missing")
        snap(pg, "C", "14-replay")
        ctx.close()
        # D: the day before
        ctx = b.new_context(viewport={"width": 820, "height": 1180}); pg = ctx.new_page(); watch(pg, "D")
        pg.goto(url(day - datetime.timedelta(days=1))); pg.wait_for_timeout(400)
        if "Not yet" not in pg.inner_text("#app"): bad("[D] the game opened before its day")
        pg.goto(f"{base}/?today={day - datetime.timedelta(days=1)}"); pg.wait_for_timeout(500)
        if G["title"] in pg.inner_text("#hub"): bad("[D] the home page shows the game before its day")
        ctx.close()
        # E: weekend passcode
        wk = entry["week"]; wenc = (data.get("weeks") or {}).get(wk)
        if int(nnn) != 1 and not wenc: bad(f"editions.json has no weekend passcode for {wk} under 'weeks'")
        if wenc:
            wpw = decode(wenc)
            if not 2 <= len(wpw.split()) <= 5: bad("the weekend passcode must decode to 2 to 5 words")
            sat = day if day.weekday() >= 5 else day + datetime.timedelta(days=5 - day.weekday())
            week_eds = [e for e in data["editions"] if e["week"] == wk and e["date"] <= str(sat)]
            def hub_with(done_codes):
                ctx = b.new_context(viewport={"width": 820, "height": 1180}); pg = ctx.new_page(); watch(pg, "E")
                pg.goto(f"{base}/?today={sat}")
                hist = {c: {"complete": True} for c in done_codes}
                pg.evaluate("h => localStorage.setItem('ldk-v1', JSON.stringify({players:{p1:{name:'Tester',kit:{style:'solid',c1:'#1F9D6B',c2:''},goals:9,streak:1,best:1,lastN:0,subWeek:'',badges:[],history:h}},order:['p1'],last:'p1'}))", hist)
                pg.goto(f"{base}/?today={sat}"); pg.wait_for_timeout(600)
                txt = pg.inner_text("#weekendVault") if pg.locator("#weekendVault").count() else ""
                snap(pg, "E", "weekend-" + ("open" if len(done_codes) == len(week_eds) else "locked")); ctx.close(); return txt
            if wpw not in hub_with([e["code"] for e in week_eds]): bad("[E] the weekend passcode did not show when every game of the week was done")
            if len(week_eds) and wpw in hub_with([e["code"] for e in week_eds][:-1]): bad("[E] the weekend passcode showed with a game still missing")
            notes.append("weekend passcode checked")
        b.close()
    httpd.shutdown()
    for n in notes: print("note:", n)
    if problems:
        print("FAIL\n- " + "\n- ".join(problems)); sys.exit(1)
    print(f"PASS  game {nnn}: \"{G['title']}\"  screenshots in {a.out}")


if __name__ == "__main__":
    main()
