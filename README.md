# Ghostwriter MCP Server

Custom MCP server for [Ghostwriter](https://www.notion.so/marketplace/custom-agents/ghostwriter) — a Notion Custom Agent that scans X/Twitter for trending content, generates posts in any voice, and learns from every edit.

## Tools

| Tool | Description |
|------|-------------|
| `scan_trending` | Scan X/Twitter for trending posts from specified accounts |
| `fetch_tweet` | Get full content of a single tweet by URL or ID |
| `fetch_user_tweets` | Get recent tweets from a user for learning their voice |
| `post_tweet` | Post a tweet to X/Twitter |

## How It Works

- Uses Twitter's GraphQL API with cookie authentication (no paid API needed)
- Runs on Cloudflare Workers (free tier)
- Supports both Streamable HTTP (`/mcp`) and SSE (`/sse`) MCP transports
- Optional auth via `MCP_SECRET` to protect your endpoints

## Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Configure secrets

Get your Twitter cookies from your browser (DevTools > Application > Cookies > x.com):

```bash
npx wrangler secret put TWITTER_AUTH_TOKEN   # auth_token cookie value
npx wrangler secret put TWITTER_CT0          # ct0 cookie value
npx wrangler secret put MCP_SECRET           # optional: protect your MCP endpoint
```

### 3. Deploy

```bash
npm run deploy
```

### 4. Connect to Notion

In your Notion Custom Agent settings, add the MCP integration:

- **URL:** `https://your-worker.workers.dev/sse?secret=YOUR_MCP_SECRET`

## Architecture

```
Notion Custom Agent
    |
    | (MCP over SSE/HTTP)
    v
Cloudflare Worker (worker.js)
    |
    | (GraphQL + Cookie Auth)
    v
Twitter/X API
```

## Endpoints

| Path | Method | Description |
|------|--------|-------------|
| `/mcp` | POST | Streamable HTTP MCP endpoint |
| `/sse` | GET | SSE MCP endpoint |
| `/sse/message` | POST | SSE message handler |
| `/` | GET | Health check |

## Built for

[Notion x Contra Buildathon 2026](https://contra.com/community/topic/notioncustomagentbuildathon)

## License

MIT
