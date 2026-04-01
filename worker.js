const GRAPHQL_BASE = "https://x.com/i/api/graphql";
const BEARER_TOKEN = "AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs%3D1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA";

// GraphQL query IDs (from twitter-cli / twitter-openapi)
const QUERY_IDS = {
  UserByScreenName: "IGgvgiOx4QZndDHuD3x9TQ",
  UserTweets: "O0epvwaQPUx-bT9YlqlL6w",
  TweetDetail: "xIYgDwjboktoFeXe_fgacw",
  SearchTimeline: "rkp6b4vtR9u7v3naGoOzUQ",
  CreateTweet: "zkcFc6F-RKRgWN8HUkJfZg",
};

const FEATURES = {
  responsive_web_graphql_exclude_directive_enabled: true,
  verified_phone_label_enabled: false,
  creator_subscriptions_tweet_preview_api_enabled: true,
  responsive_web_graphql_timeline_navigation_enabled: true,
  responsive_web_graphql_skip_user_profile_image_extensions_enabled: false,
  c9s_tweet_anatomy_moderator_badge_enabled: true,
  tweetypie_unmention_optimization_enabled: true,
  responsive_web_edit_tweet_api_enabled: true,
  graphql_is_translatable_rweb_tweet_is_translatable_enabled: true,
  view_counts_everywhere_api_enabled: true,
  longform_notetweets_consumption_enabled: true,
  responsive_web_twitter_article_tweet_consumption_enabled: true,
  tweet_awards_web_tipping_enabled: false,
  longform_notetweets_rich_text_read_enabled: true,
  longform_notetweets_inline_media_enabled: true,
  rweb_video_timestamps_enabled: true,
  responsive_web_media_download_video_enabled: true,
  freedom_of_speech_not_reach_fetch_enabled: true,
  standardized_nudges_misinfo: true,
  responsive_web_enhance_cards_enabled: false,
};

// Build headers for Twitter GraphQL API
function twitterHeaders(env, isWrite = false) {
  // Use full cookie string if available, otherwise minimal
  const cookieStr = env.TWITTER_COOKIES || `auth_token=${env.TWITTER_AUTH_TOKEN}; ct0=${env.TWITTER_CT0}`;
  const headers = {
    "Authorization": `Bearer ${decodeURIComponent(BEARER_TOKEN)}`,
    "Cookie": cookieStr,
    "X-Csrf-Token": env.TWITTER_CT0,
    "Content-Type": "application/json",
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36",
    "X-Twitter-Active-User": "yes",
    "X-Twitter-Auth-Type": "OAuth2Session",
    "X-Twitter-Client-Language": "en",
    "Origin": "https://x.com",
    "Referer": isWrite ? "https://x.com/compose/post" : "https://x.com/",
    "Accept": "*/*",
    "Sec-Fetch-Dest": "empty",
    "Sec-Fetch-Mode": "cors",
    "Sec-Fetch-Site": "same-origin",
  };
  return headers;
}

// Get user ID by screen name
async function getUserId(screenName, env) {
  const variables = { screen_name: screenName, withSafetyModeUserFields: true };
  const params = new URLSearchParams({
    variables: JSON.stringify(variables),
    features: JSON.stringify(FEATURES),
  });
  const url = `${GRAPHQL_BASE}/${QUERY_IDS.UserByScreenName}/UserByScreenName?${params}`;
  const resp = await fetch(url, { headers: twitterHeaders(env) });
  if (!resp.ok) throw new Error(`Twitter API ${resp.status}`);
  const data = await resp.json();
  return data?.data?.user?.result?.rest_id;
}

// Parse tweet from GraphQL response
function parseTweet(entry) {
  try {
    const result = entry?.content?.itemContent?.tweet_results?.result;
    if (!result) return null;
    const tweet = result.tweet || result;
    const legacy = tweet.legacy;
    if (!legacy) return null;
    const userResult = tweet.core?.user_results?.result;
    const screenName = userResult?.core?.screen_name || userResult?.legacy?.screen_name || "unknown";
    const views = tweet.views?.count || "0";
    return {
      tweet_id: legacy.id_str,
      author: `@${screenName}`,
      text: legacy.full_text || "",
      url: `https://x.com/${screenName}/status/${legacy.id_str}`,
      views: parseInt(views) || 0,
      likes: legacy.favorite_count || 0,
      retweets: legacy.retweet_count || 0,
      created_at: legacy.created_at,
    };
  } catch (_) {
    return null;
  }
}

// Fetch user tweets via GraphQL
async function fetchUserTweets(screenName, count, env) {
  const userId = await getUserId(screenName, env);
  if (!userId) throw new Error(`User @${screenName} not found`);

  const variables = {
    userId,
    count: count || 10,
    includePromotedContent: false,
    withQuickPromoteEligibilityTweetFields: false,
    withVoice: false,
    withV2Timeline: true,
  };
  const params = new URLSearchParams({
    variables: JSON.stringify(variables),
    features: JSON.stringify(FEATURES),
  });
  const url = `${GRAPHQL_BASE}/${QUERY_IDS.UserTweets}/UserTweets?${params}`;
  const resp = await fetch(url, { headers: twitterHeaders(env) });
  if (!resp.ok) throw new Error(`Twitter API ${resp.status}`);
  const data = await resp.json();

  const timeline = data?.data?.user?.result?.timeline_v2?.timeline || data?.data?.user?.result?.timeline?.timeline;
  const instructions = timeline?.instructions || [];
  const tweets = [];
  for (const inst of instructions) {
    if (inst.type !== "TimelineAddEntries") continue;
    for (const entry of inst.entries || []) {
      if (!entry.entryId?.startsWith("tweet-")) continue;
      const t = parseTweet(entry);
      if (t) tweets.push(t);
    }
  }
  return tweets;
}

// Fetch single tweet detail
async function fetchTweetDetail(tweetId, env) {
  const variables = {
    focalTweetId: tweetId,
    with_rux_injections: false,
    includePromotedContent: false,
    withCommunity: false,
    withQuickPromoteEligibilityTweetFields: false,
    withBirdwatchNotes: false,
    withVoice: false,
    withV2Timeline: true,
  };
  const params = new URLSearchParams({
    variables: JSON.stringify(variables),
    features: JSON.stringify(FEATURES),
  });
  const url = `${GRAPHQL_BASE}/${QUERY_IDS.TweetDetail}/TweetDetail?${params}`;
  const resp = await fetch(url, { headers: twitterHeaders(env) });
  if (!resp.ok) throw new Error(`Twitter API ${resp.status}`);
  const data = await resp.json();

  const instructions = data?.data?.threaded_conversation_with_injections_v2?.instructions || [];
  for (const inst of instructions) {
    if (inst.type !== "TimelineAddEntries") continue;
    for (const entry of inst.entries || []) {
      if (entry.entryId === `tweet-${tweetId}`) {
        return parseTweet(entry);
      }
    }
  }
  return null;
}

// Post tweet via GraphQL CreateTweet
async function createTweet(text, env) {
  const variables = {
    tweet_text: text,
    dark_request: false,
    media: { media_entities: [], possibly_sensitive: false },
    semantic_annotation_ids: [],
  };
  const url = `${GRAPHQL_BASE}/${QUERY_IDS.CreateTweet}/CreateTweet`;
  const resp = await fetch(url, {
    method: "POST",
    headers: twitterHeaders(env),
    body: JSON.stringify({ variables, features: FEATURES, queryId: QUERY_IDS.CreateTweet }),
  });
  const data = await resp.json();
  if (!resp.ok) throw new Error(`Twitter API ${resp.status}: ${JSON.stringify(data)}`);
  const result = data?.data?.create_tweet?.tweet_results?.result;
  const tweetId = result?.rest_id || result?.legacy?.id_str;
  return tweetId;
}

// ── Tool definitions ────────────────────────────────────────────────────

const TOOLS = [
  {
    name: "scan_trending",
    description: "Scan X/Twitter for trending posts from specified accounts.",
    inputSchema: {
      type: "object",
      properties: {
        accounts: { type: "string", description: "Comma-separated @handles to scan" },
        topics: { type: "string", description: "Comma-separated topic keywords" },
        count: { type: "number", description: "Max results (default 10)" },
      },
      required: ["accounts"],
    },
  },
  {
    name: "fetch_tweet",
    description: "Get full content of a single tweet by URL or ID.",
    inputSchema: {
      type: "object",
      properties: {
        tweet_id: { type: "string", description: "Tweet ID or full URL" },
      },
      required: ["tweet_id"],
    },
  },
  {
    name: "fetch_user_tweets",
    description: "Get recent tweets from a user for learning their voice.",
    inputSchema: {
      type: "object",
      properties: {
        screen_name: { type: "string", description: "Twitter handle without @" },
        count: { type: "number", description: "Number of tweets (default 10)" },
      },
      required: ["screen_name"],
    },
  },
  {
    name: "post_tweet",
    description: "Post a tweet to X/Twitter.",
    inputSchema: {
      type: "object",
      properties: {
        text: { type: "string", description: "Tweet text" },
      },
      required: ["text"],
    },
  },
];

// ── Tool handlers ───────────────────────────────────────────────────────

async function handleScanTrending({ accounts, topics, count }, env) {
  const accountList = accounts.split(",").map(a => a.trim().replace("@", "")).filter(Boolean);
  const topicList = (topics || "").toLowerCase().split(",").map(t => t.trim()).filter(Boolean);
  const maxCount = count || 10;
  const threeDaysAgo = Date.now() - 3 * 24 * 60 * 60 * 1000;
  const allTweets = [];

  for (const account of accountList.slice(0, 20)) {
    try {
      const tweets = await fetchUserTweets(account, 10, env);
      for (const t of tweets) {
        const created = new Date(t.created_at).getTime();
        if (created < threeDaysAgo) continue;
        const text = (t.text || "").toLowerCase();
        const matchesTopic = topicList.length === 0 || topicList.some(topic => text.includes(topic));
        if (!matchesTopic) continue;
        allTweets.push(t);
      }
    } catch (_) { continue; }
  }

  allTweets.sort((a, b) => (Number(b.views) + b.likes * 10) - (Number(a.views) + a.likes * 10));
  return [{ type: "text", text: JSON.stringify({ results: allTweets.slice(0, maxCount), scanned: accountList.length }, null, 2) }];
}

async function handleFetchTweet({ tweet_id }, env) {
  let id = tweet_id;
  const match = id.match(/status\/(\d+)/);
  if (match) id = match[1];
  const t = await fetchTweetDetail(id, env);
  if (!t) return [{ type: "text", text: JSON.stringify({ error: "Tweet not found" }) }];
  return [{ type: "text", text: JSON.stringify(t, null, 2) }];
}

async function handleFetchUserTweets({ screen_name, count }, env) {
  const name = screen_name.replace("@", "");
  const tweets = await fetchUserTweets(name, count || 10, env);
  return [{ type: "text", text: JSON.stringify({ screen_name: name, tweets }, null, 2) }];
}

async function handlePostTweet({ text }, env) {
  try {
    // Proxy to local post-server (uses twitter-cli with TLS fingerprinting)
    if (env.POST_SERVER_URL) {
      const resp = await fetch(`${env.POST_SERVER_URL}/post`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, secret: env.POST_SERVER_SECRET || "" }),
      });
      const data = await resp.json();
      if (data.success && data.tweet_id) {
        return [{ type: "text", text: JSON.stringify(data) }];
      }
      return [{ type: "text", text: JSON.stringify({ error: data.error || "Post server failed", raw: data }) }];
    }

    // Fallback: direct GraphQL (may hit TLS fingerprint limits)
    const variables = {
      tweet_text: text,
      dark_request: false,
      media: { media_entities: [], possibly_sensitive: false },
      semantic_annotation_ids: [],
    };
    const url = `${GRAPHQL_BASE}/${QUERY_IDS.CreateTweet}/CreateTweet`;
    const resp = await fetch(url, {
      method: "POST",
      headers: twitterHeaders(env, true),
      body: JSON.stringify({ variables, features: FEATURES, queryId: QUERY_IDS.CreateTweet }),
    });
    const data = await resp.json();
    if (!resp.ok) return [{ type: "text", text: JSON.stringify({ error: data, status: resp.status }) }];
    const result = data?.data?.create_tweet?.tweet_results?.result;
    const tweetId = result?.rest_id || result?.legacy?.id_str;
    if (!tweetId) return [{ type: "text", text: JSON.stringify({ error: "No tweet ID in response", raw: data }) }];
    return [{ type: "text", text: JSON.stringify({ success: true, tweet_id: tweetId, url: `https://x.com/i/status/${tweetId}` }) }];
  } catch (e) {
    return [{ type: "text", text: JSON.stringify({ error: e.message }) }];
  }
}

const TOOL_HANDLERS = {
  scan_trending: handleScanTrending,
  fetch_tweet: handleFetchTweet,
  fetch_user_tweets: handleFetchUserTweets,
  post_tweet: handlePostTweet,
};

// ── MCP JSON-RPC ────────────────────────────────────────────────────────

function jsonrpc(id, result) {
  return { jsonrpc: "2.0", id, result };
}

function jsonrpcError(id, code, message) {
  return { jsonrpc: "2.0", id, error: { code, message } };
}

async function handleJsonRpc(body, env) {
  const { id, method, params } = body;

  switch (method) {
    case "initialize":
      return jsonrpc(id, {
        protocolVersion: "2024-11-05",
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: "ghostwriter-mcp", version: "1.0.0" },
      });

    case "notifications/initialized":
      return null;

    case "tools/list":
      return jsonrpc(id, { tools: TOOLS });

    case "tools/call": {
      const toolName = params?.name;
      const handler = TOOL_HANDLERS[toolName];
      if (!handler) return jsonrpcError(id, -32602, `Unknown tool: ${toolName}`);
      try {
        const content = await handler(params?.arguments || {}, env);
        return jsonrpc(id, { content });
      } catch (e) {
        return jsonrpc(id, { content: [{ type: "text", text: JSON.stringify({ error: e.message }) }], isError: true });
      }
    }

    case "ping":
      return jsonrpc(id, {});

    default:
      return jsonrpcError(id, -32601, `Method not found: ${method}`);
  }
}

// ── Worker fetch handler ────────────────────────────────────────────────

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS, DELETE",
      "Access-Control-Allow-Headers": "Content-Type, Authorization, Mcp-Session-Id",
      "Access-Control-Expose-Headers": "Mcp-Session-Id",
    };

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    // Auth check — require MCP_SECRET in query string or Authorization header
    const secret = url.searchParams.get("secret") || request.headers.get("Authorization")?.replace("Bearer ", "");
    const isAuthRequired = url.pathname.startsWith("/mcp") || url.pathname.startsWith("/sse");
    if (isAuthRequired && env.MCP_SECRET && secret !== env.MCP_SECRET) {
      return new Response("Unauthorized", { status: 401, headers: corsHeaders });
    }

    // Streamable HTTP MCP endpoint
    if (url.pathname === "/mcp" && request.method === "POST") {
      const body = await request.json();
      const sessionId = request.headers.get("mcp-session-id") || crypto.randomUUID();

      if (Array.isArray(body)) {
        const results = [];
        for (const req of body) {
          const result = await handleJsonRpc(req, env);
          if (result) results.push(result);
        }
        return new Response(JSON.stringify(results.length === 1 ? results[0] : results), {
          headers: { "Content-Type": "application/json", "Mcp-Session-Id": sessionId, ...corsHeaders },
        });
      }

      const result = await handleJsonRpc(body, env);
      if (!result) {
        return new Response(null, { status: 202, headers: { "Mcp-Session-Id": sessionId, ...corsHeaders } });
      }
      return new Response(JSON.stringify(result), {
        headers: { "Content-Type": "application/json", "Mcp-Session-Id": sessionId, ...corsHeaders },
      });
    }

    // SSE endpoint
    if (url.pathname === "/sse" && request.method === "GET") {
      const sessionId = crypto.randomUUID();
      const messageUrl = `${url.origin}/sse/message?sessionId=${sessionId}`;

      const { readable, writable } = new TransformStream();
      const writer = writable.getWriter();
      const encoder = new TextEncoder();

      writer.write(encoder.encode(`event: endpoint\ndata: ${messageUrl}\n\n`));

      const interval = setInterval(() => {
        writer.write(encoder.encode(`: keepalive\n\n`)).catch(() => clearInterval(interval));
      }, 15000);

      ctx.waitUntil(new Promise((resolve) => {
        request.signal.addEventListener("abort", () => {
          clearInterval(interval);
          writer.close().catch(() => {});
          resolve();
        });
      }));

      return new Response(readable, {
        headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", "Connection": "keep-alive", ...corsHeaders },
      });
    }

    if (url.pathname === "/sse/message" && request.method === "POST") {
      const sessionId = url.searchParams.get("sessionId");
      const body = await request.json();
      const result = await handleJsonRpc(body, env);

      if (result) {
        return new Response(JSON.stringify(result), {
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }
      return new Response(null, { status: 202, headers: corsHeaders });
    }

    return new Response("Ghostwriter MCP", { status: 200, headers: corsHeaders });
  }
};
