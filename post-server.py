"""Lightweight local server that wraps twitter-cli for posting tweets.
Worker proxies post_tweet requests here to bypass TLS fingerprint detection.
Usage: python3 post-server.py
"""
import json
import subprocess
import os
from http.server import HTTPServer, BaseHTTPRequestHandler

PORT = 7890

class Handler(BaseHTTPRequestHandler):
    def do_POST(self):
        if self.path != "/post":
            self.send_response(404)
            self.end_headers()
            return

        length = int(self.headers.get("Content-Length", 0))
        body = json.loads(self.rfile.read(length)) if length else {}
        text = body.get("text", "")
        secret = body.get("secret", "")

        if secret != os.environ.get("POST_SECRET", "gw-post-local"):
            self.send_response(401)
            self.end_headers()
            self.wfile.write(b"Unauthorized")
            return

        if not text:
            self.send_response(400)
            self.end_headers()
            self.wfile.write(json.dumps({"error": "No text"}).encode())
            return

        try:
            result = subprocess.run(
                ["twitter", "post", text, "--json"],
                capture_output=True, text=True, timeout=30,
                env={**os.environ}
            )
            output = json.loads(result.stdout) if result.stdout else {}
            tweet_id = output.get("data", {}).get("id", "")
            tweet_url = output.get("data", {}).get("url", "")

            if tweet_id:
                self.send_response(200)
                self.send_header("Content-Type", "application/json")
                self.end_headers()
                self.wfile.write(json.dumps({"success": True, "tweet_id": tweet_id, "url": tweet_url}).encode())
            else:
                self.send_response(500)
                self.send_header("Content-Type", "application/json")
                self.end_headers()
                self.wfile.write(json.dumps({"error": result.stderr or "Unknown error", "stdout": result.stdout}).encode())
        except Exception as e:
            self.send_response(500)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(json.dumps({"error": str(e)}).encode())

    def log_message(self, fmt, *args):
        print(f"[post-server] {args[0]}")

if __name__ == "__main__":
    print(f"Post server running on http://localhost:{PORT}")
    HTTPServer(("0.0.0.0", PORT), Handler).serve_forever()
