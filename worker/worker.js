/**
 * Cloudflare demo backend for the UNGAG-chat frontend.
 *
 * Serves the built frontend from the ASSETS binding and answers the
 * API surface the client needs to boot without a real server: a fake
 * logged-in user (the /api/auth/refresh contract returns a token, so
 * no login screen ever appears), empty conversations, and REAL AI
 * replies via the Cloudflare Workers AI binding. Conversation history
 * is not persisted (no database on Workers); each message is answered
 * without prior context. Falls back to a canned reply if the AI
 * binding is unavailable.
 */

const JSON_HEADERS = { 'Content-Type': 'application/json' };

const AI_MODEL = '@cf/meta/llama-3.3-70b-instruct-fp8-fast';

const DEMO_TOKEN = 'demo-token-ungag';

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: JSON_HEADERS });

const USER = {
  _id: 'demo-user-0000000000000000',
  id: 'demo-user-0000000000000000',
  name: 'Demo',
  username: 'demo',
  email: 'demo@ungag.local',
  emailVerified: true,
  isVerified: true,
  role: 'ADMIN',
  provider: 'local',
  avatar: null,
  plugins: [],
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

const STARTUP_CONFIG = {
  appTitle: 'UNGAG Chat',
  customFooter: 'UNGAG Chat',
  serverDomain: '',
  analyticsGloballyEnabled: false,
  socialLogins: [],
  discordLoginEnabled: false,
  facebookLoginEnabled: false,
  githubLoginEnabled: false,
  googleLoginEnabled: false,
  openidLoginEnabled: false,
  ldap: false,
  localLoginEnabled: true,
  emailLoginEnabled: true,
  passwordResetEnabled: false,
  registrationEnabled: false,
  emailEnabled: false,
  checkEmailInput: false,
  sharedLinksEnabled: false,
  publicSharedLinksEnabled: false,
  checkCollisions: false,
  turnstileEnabled: false,
  interface: {
    endpointsMenu: true,
    modelSelect: true,
    parametersPanel: true,
    presets: true,
    multiConvoEnabled: true,
    bookmarks: true,
    prompts: true,
    agents: true,
    temporaryChat: true,
    runCode: false,
    archive: true,
    chatSearch: false,
    fileSearch: false,
    userNames: false,
  },
  modelSpecs: { list: [] },
  fileConfig: { endpoints: {}, limit: { noLimit: true } },
  rateLimits: {},
  security: { allowLoginPostLoginRedirect: true },
  balance: { enabled: false },
  style: {},
  showBirthdayIcon: false,
  helpAndFaqURL: 'https://librechat.ai',
};

const ENDPOINTS_CONFIG = {
  openAI: {
    type: 'openAI',
    label: 'UNGAG',
    iconURL: '/assets/logo.png?v=2',
    order: 0,
    disabled: false,
  },
};

const MODELS_CONFIG = { openAI: ['ungag-1'] };

/* The user-supplied UNGAG bot logo, downscaled to 128x128 for the endpoint icon. */
const UNGAG_ICON_PNG =
  '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';

const UNGAG_ICON_BYTES = Uint8Array.from(atob(UNGAG_ICON_PNG), (char) => char.charCodeAt(0));
const ICON_HEADERS = { 'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=300' };

/* Every favicon path the built frontend or browsers may request. */
const FAVICON_PATHS = new Set([
  '/ungag-icon.png',
  '/favicon.ico',
  '/favicon-ungag-v2.png',
  '/apple-touch-icon.png',
  '/web-app-manifest-192x192.png',
  '/web-app-manifest-512x512.png',
]);

const SYSTEM_PROMPT =
  'You are UNGAG, a custom AI chatbot with your own identity. ' +
  'Never claim to be ChatGPT, GPT, OpenAI, Claude, or Anthropic — if asked who you are, ' +
  'say you are UNGAG, a custom AI assistant. ' +
  'Reply in the same language the user writes in. Be helpful and concise.';

const FALLBACK_REPLY =
  'AI jest chwilowo niedostepne w tym demie (limit Cloudflare wyczerpany lub blad bindowania). ' +
  'Sprobuj ponownie pozniej.';

function conversationResponse() {
  return { conversations: [], page: 1, pages: 1, pageNumber: 0, pageSize: 10, total: 0 };
}

function roleResponse(roleName) {
  return {
    name: roleName,
    permissions: {
      PROMPTS: { USE: true, CREATE: true, SHARE: true, SHARE_PUBLIC: true },
      BOOKMARKS: { USE: true },
      MEMORIES: { USE: true, CREATE: true, UPDATE: true, READ: true, OPT_OUT: true },
      AGENTS: { USE: true, CREATE: true, SHARE: true, SHARE_PUBLIC: true },
      MULTI_CONVO: { USE: true },
      TEMPORARY_CHAT: { USE: true },
      RUN_CODE: { USE: true },
      WEB_SEARCH: { USE: true },
      PEOPLE_PICKER: { VIEW_USERS: true, VIEW_GROUPS: true, VIEW_ROLES: true },
      MARKETPLACE: { USE: true },
      FILE_SEARCH: { USE: true },
      FILE_CITATIONS: { USE: true },
      MCP_SERVERS: {
        USE: true,
        CREATE: true,
        SHARE: true,
        SHARE_PUBLIC: true,
        CONFIGURE_OBO: true,
      },
      REMOTE_AGENTS: { USE: true, CREATE: true, SHARE: true, SHARE_PUBLIC: true },
      SKILLS: { USE: true, CREATE: true, SHARE: true, SHARE_PUBLIC: true },
      SHARED_LINKS: { CREATE: true, SHARE: true, SHARE_PUBLIC: true },
      SCHEDULES: { USE: true, CREATE: true },
    },
  };
}

async function streamOpenRouter(env, messages, send) {
  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.OPENROUTER_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: env.OPENROUTER_MODEL || 'openai/gpt-4o-mini',
      messages,
      stream: true,
    }),
  });
  if (!response.ok || !response.body) {
    throw new Error(`OpenRouter HTTP ${response.status}`);
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('data:')) {
        continue;
      }
      const data = trimmed.slice(5).trim();
      if (data === '[DONE]') {
        return;
      }
      try {
        const chunk = JSON.parse(data);
        const text = chunk.choices?.[0]?.delta?.content;
        if (typeof text === 'string' && text.length > 0) {
          send({ message: text, initial: false });
        }
      } catch (_err) {
        // ignore malformed chunks
      }
    }
  }
}

async function aiSseResponse(env, userText) {
  const messages = [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: userText },
  ];
  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      const send = (obj) => controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));
      const conversationId = `demo-${Date.now().toString(36)}`;
      const messageId = `msg-${Date.now().toString(36)}`;
      send({
        message: {
          messageId,
          conversationId,
          parentMessageId: '000000000000000000000000',
          text: '',
          endpoint: 'openAI',
          model: 'ungag-1',
          isCreatedByUser: false,
          sender: 'UNGAG',
          unfinished: true,
          error: false,
        },
        initial: true,
        conversation: { conversationId, title: userText.slice(0, 40) || 'New chat' },
      });
      try {
        if (env.OPENROUTER_API_KEY) {
          await streamOpenRouter(env, messages, send);
        } else {
          if (!env.AI) {
            throw new Error('AI binding unavailable');
          }
          const result = await env.AI.run(AI_MODEL, {
            messages,
            stream: true,
            max_tokens: 1024,
          });
          for await (const chunk of result) {
            const text = chunk && chunk.response;
            if (typeof text === 'string' && text.length > 0) {
              send({ message: text, initial: false });
            }
          }
        }
      } catch (_err) {
        send({ message: FALLBACK_REPLY, initial: false });
      }
      send({ final: true, message: '', conversation: { conversationId } });
      controller.close();
    },
  });
  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}

async function handleApi(pathname, request, env) {
  switch (pathname) {
    case '/api/user':
      return json(USER);
    case '/api/user/terms':
      return json({ termsAccepted: true });
    case '/api/user/settings/favorites':
      return json([]);
    case '/api/user/settings/pinned-order':
      return json([]);
    case '/api/user/settings/favorites/tools':
      return json([]);
    case '/api/user/settings/skills/active':
      return json({});
    case '/api/projects':
      return json({ projects: [], nextCursor: null });
    case '/api/auth/refresh':
      return json({ token: DEMO_TOKEN, user: USER });
    case '/api/auth/login':
      return json({ token: DEMO_TOKEN, user: USER, twoFAPending: false });
    case '/api/auth/logout':
      return json({ message: 'ok' });
    case '/api/presets':
      return json([]);
    case '/api/config':
      return json(STARTUP_CONFIG);
    case '/api/endpoints':
      return json(ENDPOINTS_CONFIG);
    case '/api/models':
      return json(MODELS_CONFIG);
    case '/api/search/enable':
      return json(false);
    case '/api/convos':
      return json(conversationResponse());
    case '/api/convos/settings':
      return json({});
    case '/api/balance':
      return json({ tokenCredits: 1000000, automaticBilling: false });
    case '/api/banner':
      return json([]);
    case '/api/tags':
      return json([]);
    case '/api/agents':
      return json({ data: [], hasMore: false, after: null });
    case '/api/agents/categories':
      return json([]);
    case '/api/agents/default':
      return json({ id: 'demo-agent', name: 'Demo agent', agent: null });
    case '/api/keys':
      return json([]);
    case '/api/user/plugins':
      return json([]);
    case '/api/search':
      return json({ hits: [] });
    default:
      break;
  }
  if (pathname.startsWith('/api/roles/')) {
    const roleName = (pathname.split('/').pop() || 'USER').toUpperCase();
    return json(roleResponse(roleName));
  }
  if (pathname.startsWith('/api/convos/')) {
    return json(conversationResponse());
  }
  if (pathname.startsWith('/api/messages')) {
    return json({ messages: [] });
  }
  if (pathname.startsWith('/api/files')) {
    return json([]);
  }
  if (
    pathname.startsWith('/api/ask/') ||
    pathname.startsWith('/api/edit/') ||
    pathname.startsWith('/api/agents/chat')
  ) {
    let userText = 'Hello';
    try {
      const body = await request.json();
      if (body && typeof body.text === 'string' && body.text.trim().length > 0) {
        userText = body.text.trim();
      }
    } catch (_e) {
      // keep default text
    }
    return aiSseResponse(env, userText);
  }
  return json({});
}

export default {
  async fetch(request, env) {
    const { pathname } = new URL(request.url);
    if (pathname === '/health') {
      return json({ message: 'demo', status: 'ok' });
    }
    if (FAVICON_PATHS.has(pathname)) {
      if (pathname === '/favicon.ico' || pathname === '/favicon-ungag-v2.png') {
        const faviconUrl = new URL('/assets/favicon-32x32.png?v=3', request.url);
        return env.ASSETS.fetch(new Request(faviconUrl, request));
      }
      return new Response(UNGAG_ICON_BYTES, { headers: ICON_HEADERS });
    }
    if (pathname.startsWith('/api/')) {
      return handleApi(pathname, request, env);
    }
    return env.ASSETS.fetch(request);
  },
};
