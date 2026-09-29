"""Local mirror of the Vercel setup: serve public/ with clean URLs and proxy /api to the live backend."""
import http.server, urllib.request, os
ROOT = "/opt/hermes/projects/clout/clout-frontend/public"
API = "http://127.0.0.1:7080"

class H(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **k): super().__init__(*a, directory=ROOT, **k)
    def log_message(self, *a): pass
    def _proxy(self):
        body = self.rfile.read(int(self.headers.get("Content-Length") or 0)) or None
        req = urllib.request.Request(API + self.path, data=body, method=self.command)
        for k in ("Authorization", "Content-Type"):
            if self.headers.get(k): req.add_header(k, self.headers[k])
        try: r = urllib.request.urlopen(req, timeout=15); code, data, ct = r.status, r.read(), r.headers.get("Content-Type")
        except urllib.error.HTTPError as e: code, data, ct = e.code, e.read(), e.headers.get("Content-Type")
        self.send_response(code); self.send_header("Content-Type", ct or "application/json"); self.end_headers(); self.wfile.write(data)
    def do_GET(self):
        if self.path.startswith("/api/"): return self._proxy()
        path = self.path.split("?")[0].split("#")[0]
        if path in ("/app", "/profile"): self.path = path + ".html" + self.path[len(path):]
        return super().do_GET()
    def do_POST(self): return self._proxy()
    def do_PUT(self): return self._proxy()

http.server.ThreadingHTTPServer(("127.0.0.1", 9147), H).serve_forever()
