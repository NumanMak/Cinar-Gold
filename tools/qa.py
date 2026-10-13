#!/usr/bin/env python
"""Headless-Edge QA harness for a static website.

Serves the project root over a local HTTP server, drives Microsoft Edge in
headless mode through the Chrome DevTools Protocol (websocket-client), and for
each device profile collects screenshots plus a QA report (console errors,
exceptions, failed requests, transfer sizes, timings, LCP/CLS, horizontal
overflow, images without alt / broken, duplicate ids).

Usage examples (from the project root):
    python tools\\qa.py
    python tools\\qa.py --profiles desktop,mobile --wait 1500
    python tools\\qa.py --path tools/qa_test/index.html --hover ".btn" --click "a[href='#about']"
    python tools\\qa.py --only-report --reduced-motion
    python tools\\qa.py --sections "#hero,#iletisim" --no-full
    python tools\\qa.py --eval "document.title"

Outputs: tools\\shots\\*.png / *.jpg and tools\\shots\\report.json.
Exit code: 0 on success, 1 if any profile had errors, 2 on harness failure.
"""
from __future__ import annotations

import argparse
import base64
import functools
import http.server
import io
import json
import os
import queue
import shutil
import socket
import subprocess
import sys
import threading
import time
import urllib.request
from pathlib import Path

import websocket  # websocket-client
from PIL import Image

TOOLS = Path(__file__).resolve().parent
ROOT = TOOLS.parent
SHOTS = TOOLS / "shots"
PROFILE_DIR = TOOLS / ".edge-profile"
EDGE = r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"

IPHONE_UA = ("Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 "
             "(KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1")
IPAD_UA = ("Mozilla/5.0 (iPad; CPU OS 17_5 like Mac OS X) AppleWebKit/605.1.15 "
           "(KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1")

PROFILES = {
    "desktop": dict(width=1440, height=900, dpr=1, mobile=False, ua=None),
    "laptop": dict(width=1280, height=800, dpr=1, mobile=False, ua=None),
    "tablet": dict(width=820, height=1180, dpr=1, mobile=True, ua=IPAD_UA),
    "mobile": dict(width=390, height=844, dpr=2, mobile=True, ua=IPHONE_UA),
}

# Injected before any page script: collects LCP (with element info) and CLS.
PERF_SCRIPT = r"""
(() => {
  window.__qa = {lcp: null, cls: 0};
  try {
    new PerformanceObserver(list => {
      for (const e of list.getEntries()) {
        const el = e.element;
        window.__qa.lcp = {
          time: Math.round(e.startTime), size: e.size,
          tag: el ? el.tagName.toLowerCase() : null,
          id: el && el.id || null,
          cls: el && typeof el.className === 'string' ? el.className : null,
          src: e.url || (el && (el.currentSrc || el.src)) || null,
        };
      }
    }).observe({type: 'largest-contentful-paint', buffered: true});
    new PerformanceObserver(list => {
      for (const e of list.getEntries()) if (!e.hadRecentInput) window.__qa.cls += e.value;
    }).observe({type: 'layout-shift', buffered: true});
  } catch (err) {}
})();
"""

# Helper functions installed into the page for measurements.
PAGE_HELPERS = r"""
window.__qaPath = el => {
  const parts = [];
  for (let n = el, i = 0; n && n.nodeType === 1 && i < 4; n = n.parentElement, i++) {
    let s = n.tagName.toLowerCase();
    if (n.id) { s += '#' + n.id; parts.unshift(s); break; }
    if (typeof n.className === 'string' && n.className.trim())
      s += '.' + n.className.trim().split(/\s+/).slice(0, 2).join('.');
    parts.unshift(s);
  }
  return parts.join(' > ');
};
window.__qaScroll = y => {
  window.scrollTo(0, y);
  try { window.lenis && window.lenis.scrollTo(y, {immediate: true}); } catch (e) {}
};
window.__qaHeaderH = () => {
  for (const el of document.querySelectorAll('header, nav, [class*="header"], [class*="nav"], body > *')) {
    const cs = getComputedStyle(el);
    if (cs.position !== 'fixed' && cs.position !== 'sticky') continue;
    const r = el.getBoundingClientRect();
    if (r.height > 0 && r.top <= 1 && r.height < innerHeight * 0.4 && r.width >= innerWidth * 0.5)
      return Math.round(r.bottom);
  }
  return 0;
};
"""

AUDIT_SCRIPT = r"""
(() => {
  const vw = window.innerWidth;
  const de = document.documentElement;
  const overflow = [];
  if (de.scrollWidth > vw) {
    for (const el of document.body.querySelectorAll('*')) {
      const r = el.getBoundingClientRect();
      if (r.width && r.right > vw + 1) overflow.push({path: __qaPath(el), right: Math.round(r.right)});
    }
    overflow.sort((a, b) => b.right - a.right);
  }
  const imgs = [...document.images];
  const ids = {};
  for (const el of document.querySelectorAll('[id]')) ids[el.id] = (ids[el.id] || 0) + 1;
  const nav = performance.getEntriesByType('navigation')[0];
  return {
    title: document.title,
    scrollWidth: de.scrollWidth, innerWidth: vw, scrollHeight: de.scrollHeight,
    overflowElements: overflow.slice(0, 10),
    imagesWithoutAlt: imgs.filter(i => !i.hasAttribute('alt')).map(i => i.getAttribute('src') || __qaPath(i)),
    brokenImages: imgs.filter(i => i.complete && i.naturalWidth === 0 && (i.currentSrc || i.src))
                      .map(i => i.currentSrc || i.src),
    duplicateIds: Object.entries(ids).filter(([, c]) => c > 1).map(([id, c]) => ({id, count: c})),
    timings: nav ? {domContentLoaded: Math.round(nav.domContentLoadedEventEnd),
                    load: Math.round(nav.loadEventEnd)} : null,
    lcp: window.__qa ? window.__qa.lcp : null,
    cls: window.__qa ? +window.__qa.cls.toFixed(4) : null,
  };
})()
"""


# --------------------------------------------------------------------------- utils
def free_port() -> int:
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


def log(msg: str) -> None:
    print(msg, flush=True)


class QuietHandler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *args):  # silence access log
        pass

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()


def start_server(root: Path):
    port = free_port()
    handler = functools.partial(QuietHandler, directory=str(root))
    httpd = http.server.ThreadingHTTPServer(("127.0.0.1", port), handler)
    httpd.daemon_threads = True
    t = threading.Thread(target=httpd.serve_forever, name="qa-http", daemon=True)
    t.start()
    return httpd, port


# --------------------------------------------------------------------------- CDP
class CDPError(RuntimeError):
    pass


class CDP:
    """Minimal synchronous CDP client with a background reader thread."""

    def __init__(self, ws_url: str, timeout: float = 30):
        self.timeout = timeout
        self.ws = websocket.create_connection(ws_url, timeout=timeout, suppress_origin=True)
        self._id = 0
        self._lock = threading.Lock()
        self._pending: dict[int, queue.Queue] = {}
        self._listeners: list = []
        self._closed = False
        self._reader = threading.Thread(target=self._read_loop, name="qa-cdp", daemon=True)
        self._reader.start()

    def _read_loop(self):
        self.ws.settimeout(1)
        while not self._closed:
            try:
                raw = self.ws.recv()
            except websocket.WebSocketTimeoutException:
                continue
            except Exception:
                break
            if not raw:
                continue
            msg = json.loads(raw)
            if "id" in msg:
                q = self._pending.pop(msg["id"], None)
                if q:
                    q.put(msg)
            else:
                for fn in list(self._listeners):
                    try:
                        fn(msg["method"], msg.get("params", {}))
                    except Exception as e:  # never kill the reader
                        log(f"  [listener error] {e}")

    def on(self, fn):
        self._listeners.append(fn)

    def send(self, method: str, params: dict | None = None, timeout: float | None = None):
        with self._lock:
            self._id += 1
            mid = self._id
            q: queue.Queue = queue.Queue()
            self._pending[mid] = q
            self.ws.send(json.dumps({"id": mid, "method": method, "params": params or {}}))
        try:
            msg = q.get(timeout=timeout or self.timeout)
        except queue.Empty:
            self._pending.pop(mid, None)
            raise CDPError(f"timeout waiting for {method}")
        if "error" in msg:
            raise CDPError(f"{method}: {msg['error']}")
        return msg.get("result", {})

    def eval(self, expr: str, timeout: float | None = None):
        r = self.send("Runtime.evaluate", {"expression": expr, "returnByValue": True,
                                           "awaitPromise": True}, timeout)
        if "exceptionDetails" in r:
            d = r["exceptionDetails"]
            raise CDPError(f"eval failed: {d.get('exception', {}).get('description') or d.get('text')}")
        return r.get("result", {}).get("value")

    def close(self):
        self._closed = True
        try:
            self.ws.close()
        except Exception:
            pass


# --------------------------------------------------------------------------- Edge
class Edge:
    def __init__(self):
        self.port = free_port()
        self.proc: subprocess.Popen | None = None

    def start(self):
        if not os.path.exists(EDGE):
            raise SystemExit(f"Edge not found at {EDGE}")
        PROFILE_DIR.mkdir(parents=True, exist_ok=True)
        args = [EDGE, "--headless=new", f"--remote-debugging-port={self.port}",
                "--remote-allow-origins=*", f"--user-data-dir={PROFILE_DIR}",
                "--no-first-run", "--no-default-browser-check", "--disable-extensions",
                "--hide-scrollbars", "--mute-audio", "--autoplay-policy=no-user-gesture-required",
                "--disable-background-timer-throttling", "--disable-renderer-backgrounding",
                "about:blank"]
        flags = getattr(subprocess, "CREATE_NEW_PROCESS_GROUP", 0)
        self.proc = subprocess.Popen(args, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                                     creationflags=flags)
        deadline = time.time() + 20
        while time.time() < deadline:
            if self.proc.poll() is not None:
                raise RuntimeError(f"Edge exited early (code {self.proc.returncode})")
            try:
                self._http("/json/version", timeout=1)
                return
            except Exception:
                time.sleep(0.2)
        raise RuntimeError("Edge DevTools endpoint did not come up")

    def _http(self, path: str, method: str = "GET", timeout: float = 5):
        req = urllib.request.Request(f"http://127.0.0.1:{self.port}{path}", method=method)
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return json.loads(r.read().decode() or "null")

    def new_tab_ws(self) -> str:
        return self._http("/json/new?about:blank", method="PUT")["webSocketDebuggerUrl"]

    def stop(self):
        if not self.proc:
            return
        if self.proc.poll() is None:
            if os.name == "nt":  # kill the whole process tree (renderers, gpu, ...)
                subprocess.run(["taskkill", "/PID", str(self.proc.pid), "/T", "/F"],
                               stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=15)
            else:
                self.proc.kill()
            try:
                self.proc.wait(timeout=10)
            except Exception:
                pass
        self.proc = None


# --------------------------------------------------------------------------- run
class ProfileRun:
    """Runs all checks/screenshots for one device profile on a shared tab."""

    def __init__(self, cdp: CDP, name: str, cfg: dict, url: str, args):
        self.cdp, self.name, self.cfg, self.url, self.args = cdp, name, cfg, url, args
        self.console: list = []
        self.exceptions: list = []
        self.failed: list = []
        self.http_errors: list = []
        self.requests: dict = {}
        self.bytes_by_type: dict = {}
        self.loaded = threading.Event()
        self.shots: list = []
        self.evals: list = []

    # ---- events
    def handle(self, method: str, p: dict):
        if method == "Runtime.consoleAPICalled" and p.get("type") in ("error", "warning", "assert"):
            text = " ".join(str(a.get("value", a.get("description", a.get("type"))))
                            for a in p.get("args", []))
            frame = (p.get("stackTrace") or {}).get("callFrames") or [{}]
            self.console.append({"level": p["type"], "text": text, "source": "console",
                                 "url": frame[0].get("url"), "line": frame[0].get("lineNumber")})
        elif method == "Log.entryAdded":
            e = p["entry"]
            if e.get("level") in ("error", "warning"):
                self.console.append({"level": e["level"], "text": e.get("text"),
                                     "source": e.get("source"), "url": e.get("url")})
        elif method == "Runtime.exceptionThrown":
            d = p["exceptionDetails"]
            frames = (d.get("stackTrace") or {}).get("callFrames", [])
            self.exceptions.append({
                "text": (d.get("exception") or {}).get("description") or d.get("text"),
                "url": d.get("url"), "line": d.get("lineNumber"),
                "stack": [f"{f.get('functionName') or '<anon>'} {f.get('url')}:{f.get('lineNumber')}"
                          for f in frames]})
        elif method == "Network.requestWillBeSent":
            self.requests[p["requestId"]] = {"url": p["request"]["url"], "type": p.get("type", "Other")}
        elif method == "Network.responseReceived":
            r = self.requests.setdefault(p["requestId"], {"url": p["response"]["url"]})
            r["type"] = p.get("type", r.get("type", "Other"))
            status = p["response"].get("status", 0)
            if status >= 400:
                self.http_errors.append({"status": status, "url": p["response"]["url"]})
        elif method == "Network.loadingFinished":
            r = self.requests.get(p["requestId"], {})
            t = r.get("type", "Other")
            self.bytes_by_type[t] = self.bytes_by_type.get(t, 0) + int(p.get("encodedDataLength", 0))
        elif method == "Network.loadingFailed":
            r = self.requests.get(p["requestId"], {})
            self.failed.append({"url": r.get("url"), "type": p.get("type"),
                                "error": p.get("errorText"), "blocked": p.get("blockedReason")})
        elif method == "Page.loadEventFired":
            self.loaded.set()

    # ---- helpers
    def sleep_ms(self, ms):
        time.sleep(ms / 1000)

    def scroll(self, y):
        self.cdp.eval(f"__qaScroll({int(y)})")

    def screenshot(self, fname: str, full_clip: dict | None = None) -> bytes:
        params = {"format": "png"}
        if full_clip:
            params.update(captureBeyondViewport=True, clip=full_clip)
        data = base64.b64decode(self.cdp.send("Page.captureScreenshot", params, timeout=90)["data"])
        if fname:
            (SHOTS / fname).write_bytes(data)
            self.shots.append(fname)
        return data

    # ---- steps
    def setup(self):
        c, cfg = self.cdp, self.cfg
        c.send("Emulation.setDeviceMetricsOverride", {
            "width": cfg["width"], "height": cfg["height"], "deviceScaleFactor": cfg["dpr"],
            "mobile": cfg["mobile"], "screenWidth": cfg["width"], "screenHeight": cfg["height"]})
        c.send("Emulation.setTouchEmulationEnabled", {"enabled": cfg["mobile"], "maxTouchPoints": 5})
        ua = cfg["ua"] or self.default_ua
        c.send("Network.setUserAgentOverride", {"userAgent": ua})
        feats = [{"name": "prefers-reduced-motion",
                  "value": "reduce" if self.args.reduced_motion else "no-preference"}]
        c.send("Emulation.setEmulatedMedia", {"media": "", "features": feats})

    def navigate(self):
        self.cdp.send("Page.navigate", {"url": "about:blank"})
        time.sleep(0.2)
        self.loaded.clear()
        r = self.cdp.send("Page.navigate", {"url": self.url})
        if r.get("errorText"):
            raise CDPError(f"navigation failed: {r['errorText']}")
        if not self.loaded.wait(self.args.load_timeout):
            log(f"  [warn] load event not fired within {self.args.load_timeout}s")
        self.sleep_ms(self.args.wait)
        self.cdp.eval(PAGE_HELPERS)

    def scroll_through(self):
        vh = self.cfg["height"]
        y = 0
        while True:
            h = self.cdp.eval("document.documentElement.scrollHeight") or 0
            if y > h:
                break
            self.scroll(y)
            self.sleep_ms(300)
            y += vh
        self.scroll(0)
        self.sleep_ms(800)

    def section_shots(self):
        sel = self.args.sections or "section[id], footer"
        targets = self.cdp.eval(
            f"[...document.querySelectorAll({json.dumps(sel)})].map((e,i)=>e.id||String(i))") or []
        hh = self.cdp.eval("__qaHeaderH()") or 0
        for i, key in enumerate(targets):
            y = self.cdp.eval(
                f"(()=>{{const e=document.querySelectorAll({json.dumps(sel)})[{i}];"
                f"return e.getBoundingClientRect().top+scrollY-{hh};}})()")
            self.scroll(max(0, y or 0))
            self.sleep_ms(600)
            safe = "".join(ch if ch.isalnum() or ch in "-_" else "_" for ch in key)
            fname = f"{self.name}-{safe}.png"
            if fname in self.shots:  # e.g. section id "hero" vs the hero shot
                fname = f"{self.name}-section-{safe}-{i}.png"
            self.screenshot(fname)
        return hh

    def full_page(self):
        self.scroll(0)
        self.sleep_ms(400)
        w, h = self.cdp.eval("[document.documentElement.clientWidth, document.documentElement.scrollHeight]")
        h = min(h, self.args.max_full_height)
        data = self.screenshot("", {"x": 0, "y": 0, "width": w, "height": h, "scale": 1})
        img = Image.open(io.BytesIO(data)).convert("RGB")
        for n, top in enumerate(range(0, img.height, 2000), 1):
            fname = f"{self.name}-full-{n}.png"
            img.crop((0, top, img.width, min(img.height, top + 2000))).save(SHOTS / fname)
            self.shots.append(fname)
        ov = img.resize((600, max(1, round(img.height * 600 / img.width))), Image.LANCZOS)
        ov.save(SHOTS / f"{self.name}-overview.jpg", quality=80)
        self.shots.append(f"{self.name}-overview.jpg")
        self.scroll(0)
        self.sleep_ms(300)

    def element_center(self, sel):
        return self.cdp.eval(
            f"(async()=>{{const e=document.querySelector({json.dumps(sel)});if(!e)return null;"
            f"e.scrollIntoView({{block:'center'}});"
            f"try{{window.lenis&&window.lenis.scrollTo(e,{{immediate:true,offset:-innerHeight/3}})}}catch(_){{}}"
            f"await new Promise(r=>setTimeout(r,400));const r=e.getBoundingClientRect();"
            f"return [r.left+r.width/2, r.top+r.height/2];}})()")

    def mouse(self, typ, x, y, **kw):
        self.cdp.send("Input.dispatchMouseEvent", {"type": typ, "x": x, "y": y, **kw})

    def interactions(self, shots: bool):
        for n, sel in enumerate(self.args.hover or [], 1):
            pt = self.element_center(sel)
            if not pt:
                log(f"  [warn] hover selector not found: {sel}")
                continue
            self.mouse("mouseMoved", *pt)
            self.sleep_ms(800)
            if shots:
                self.screenshot(f"{self.name}-hover-{n}.png")
            self.mouse("mouseMoved", 1, 1)
        for n, sel in enumerate(self.args.click or [], 1):
            pt = self.element_center(sel)
            if not pt:
                log(f"  [warn] click selector not found: {sel}")
                continue
            self.mouse("mouseMoved", *pt)
            self.mouse("mousePressed", *pt, button="left", clickCount=1)
            self.mouse("mouseReleased", *pt, button="left", clickCount=1)
            self.sleep_ms(1000)
            if shots:
                self.screenshot(f"{self.name}-click-{n}.png")

    def run(self, default_ua: str) -> dict:
        self.default_ua = default_ua
        self.setup()
        self.navigate()
        for expr in self.args.eval or []:
            try:
                self.evals.append({"expr": expr, "result": self.cdp.eval(expr)})
            except CDPError as e:
                self.evals.append({"expr": expr, "error": str(e)})
        self.scroll_through()
        header_h = self.cdp.eval("__qaHeaderH()")
        if not self.args.only_report:
            self.screenshot(f"{self.name}-hero.png")
            header_h = self.section_shots()
            if not self.args.no_full:
                self.full_page()
        self.scroll(0)
        self.sleep_ms(300)
        audit = self.cdp.eval(AUDIT_SCRIPT)
        self.interactions(shots=not self.args.only_report)
        root_url = self.url.rsplit("/", 1)[0]
        return {
            "profile": self.name, "viewport": self.cfg | {"ua": self.cfg["ua"] or "default"},
            "url": self.url, "stickyHeaderHeight": header_h, **audit,
            "consoleMessages": self.console, "exceptions": self.exceptions,
            "failedRequests": self.failed, "httpErrors": self.http_errors,
            "bytesByType": dict(sorted(self.bytes_by_type.items())),
            "bytesTotal": sum(self.bytes_by_type.values()),
            "requestCount": len(self.requests), "evals": self.evals, "screenshots": self.shots,
            "_root": root_url,
        }


def short(url, root):
    return url.replace(root + "/", "") if url else url


def summarize(r: dict) -> bool:
    root = r.pop("_root")
    errs = [m for m in r["consoleMessages"] if m["level"] in ("error", "assert")]
    warns = [m for m in r["consoleMessages"] if m["level"] == "warning"]
    vp = r["viewport"]
    log(f"\n=== {r['profile']} {vp['width']}x{vp['height']}@{vp['dpr']}x  ({r['title']!r})")
    t = r["timings"] or {}
    lcp = r["lcp"]
    lcp_s = (f"{lcp['time']}ms <{lcp['tag']}{' #' + lcp['id'] if lcp.get('id') else ''}"
             f"{' .' + lcp['cls'] if lcp.get('cls') else ''}>"
             f"{' ' + short(lcp['src'], root)[:80] if lcp.get('src') else ''}") if lcp else "n/a"
    log(f"  timing: DCL {t.get('domContentLoaded')}ms, load {t.get('load')}ms | LCP {lcp_s} | CLS {r['cls']}")
    kb = lambda b: f"{b / 1024:.1f}KB"
    log(f"  transfer: {kb(r['bytesTotal'])} in {r['requestCount']} requests  ("
        + ", ".join(f"{k} {kb(v)}" for k, v in r["bytesByType"].items()) + ")")
    log(f"  page: {r['scrollHeight']}px tall, sticky header {r['stickyHeaderHeight']}px")
    for label, items in (("console errors", errs), ("console warnings", warns)):
        if items:
            log(f"  {label} ({len(items)}):")
            for m in items[:10]:
                log(f"    - [{m['source']}] {m['text'][:200]}" + (f"  ({short(m.get('url'), root)})" if m.get("url") else ""))
    for e in r["exceptions"]:
        log(f"  EXCEPTION: {e['text'][:300]}")
        for s in e["stack"][:5]:
            log(f"      at {short(s, root)}")
    for f in r["failedRequests"]:
        log(f"  FAILED REQUEST: {short(f['url'], root)} ({f['error']})")
    for h in r["httpErrors"]:
        log(f"  HTTP {h['status']}: {short(h['url'], root)}")
    if r["scrollWidth"] > r["innerWidth"]:
        log(f"  HORIZONTAL OVERFLOW: scrollWidth {r['scrollWidth']} > {r['innerWidth']}")
        for o in r["overflowElements"]:
            log(f"    - {o['path']} (right {o['right']})")
    if r["imagesWithoutAlt"]:
        log(f"  images without alt: {[short(u, root) for u in r['imagesWithoutAlt']]}")
    if r["brokenImages"]:
        log(f"  broken images: {[short(u, root) for u in r['brokenImages']]}")
    if r["duplicateIds"]:
        log(f"  duplicate ids: {r['duplicateIds']}")
    for ev in r["evals"]:
        log(f"  eval {ev['expr'][:60]!r} -> {json.dumps(ev.get('result', ev.get('error')), ensure_ascii=False)[:500]}")
    if r["screenshots"]:
        log(f"  screenshots: {len(r['screenshots'])} -> tools\\shots\\ ({', '.join(r['screenshots'][:6])}{', ...' if len(r['screenshots']) > 6 else ''})")
    bad = bool(errs or r["exceptions"] or r["failedRequests"] or r["httpErrors"]
               or r["brokenImages"] or r["scrollWidth"] > r["innerWidth"] or r["duplicateIds"])
    log(f"  => {'ISSUES FOUND' if bad else 'OK'}")
    return bad


def parse_args(argv=None):
    p = argparse.ArgumentParser(description="Headless Edge QA harness for a static site.")
    p.add_argument("--profiles", default="desktop,laptop,tablet,mobile",
                   help=f"comma list of {','.join(PROFILES)}")
    p.add_argument("--path", default="index.html", help="page path relative to the project root")
    p.add_argument("--wait", type=int, default=2500, help="ms to wait after load event")
    p.add_argument("--sections", help="CSS selector(s) for section screenshots (default 'section[id], footer')")
    p.add_argument("--no-full", action="store_true", help="skip full-page screenshots")
    p.add_argument("--hover", action="append", metavar="SELECTOR", help="hover element and screenshot (repeatable)")
    p.add_argument("--click", action="append", metavar="SELECTOR", help="click element and screenshot (repeatable)")
    p.add_argument("--eval", action="append", metavar="JS", help="evaluate JS after load, print JSON result (repeatable)")
    p.add_argument("--only-report", action="store_true", help="no screenshots, report only")
    p.add_argument("--reduced-motion", action="store_true", help="emulate prefers-reduced-motion: reduce")
    p.add_argument("--load-timeout", type=float, default=30, help="seconds to wait for load event")
    p.add_argument("--max-full-height", type=int, default=30000, help="cap for full-page capture height (css px)")
    p.add_argument("--keep-shots", action="store_true", help="do not clear tools\\shots before running")
    a = p.parse_args(argv)
    a.profiles = [x.strip() for x in a.profiles.split(",") if x.strip()]
    for x in a.profiles:
        if x not in PROFILES:
            p.error(f"unknown profile {x!r}")
    if not (ROOT / a.path).is_file():
        p.error(f"page not found: {ROOT / a.path}")
    return a


def main(argv=None) -> int:
    args = parse_args(argv)
    if SHOTS.exists() and not args.keep_shots:
        for f in SHOTS.iterdir():
            if f.is_file():
                f.unlink()
    SHOTS.mkdir(parents=True, exist_ok=True)

    httpd = edge = cdp = None
    results, any_bad = [], False
    try:
        httpd, sport = start_server(ROOT)
        url = f"http://127.0.0.1:{sport}/{args.path.replace(os.sep, '/').lstrip('/')}"
        log(f"serving {ROOT} at http://127.0.0.1:{sport}/  -> {url}")
        edge = Edge()
        edge.start()
        cdp = CDP(edge.new_tab_ws())
        for dom in ("Page", "Runtime", "Network", "Log"):
            cdp.send(f"{dom}.enable")
        cdp.send("Network.setCacheDisabled", {"cacheDisabled": True})
        cdp.send("Page.addScriptToEvaluateOnNewDocument", {"source": PERF_SCRIPT})
        default_ua = cdp.eval("navigator.userAgent").replace("HeadlessChrome", "Chrome")
        for name in args.profiles:
            log(f"running profile {name} ...")
            run = ProfileRun(cdp, name, PROFILES[name], url, args)
            cdp._listeners = [run.handle]
            try:
                results.append(run.run(default_ua))
            except Exception as e:
                log(f"  [error] profile {name} failed: {e}")
                results.append({"profile": name, "error": str(e)})
                any_bad = True
        cdp._listeners = []
        for r in results:
            if "error" not in r:
                any_bad |= summarize(r)
        (SHOTS / "report.json").write_text(json.dumps(
            {"url": url, "generated": time.strftime("%Y-%m-%d %H:%M:%S"),
             "reducedMotion": args.reduced_motion, "profiles": results},
            indent=2, ensure_ascii=False), encoding="utf-8")
        log(f"\nreport: {SHOTS / 'report.json'}")
        return 1 if any_bad else 0
    except KeyboardInterrupt:
        log("interrupted")
        return 130
    except Exception as e:
        log(f"harness failure: {type(e).__name__}: {e}")
        return 2
    finally:
        if cdp:
            cdp.close()
        if edge:
            edge.stop()
        if httpd:
            httpd.shutdown()
            httpd.server_close()


if __name__ == "__main__":
    sys.exit(main())
