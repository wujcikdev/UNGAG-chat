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
    iconURL: '/ungag-icon.png',
    order: 0,
    disabled: false,
  },
};

const MODELS_CONFIG = { openAI: ['ungag-1'] };

/* The UNGAG logo (user-supplied ungag.png, downscaled to 128x128) inlined as
 * base64 so the worker can serve it without an extra asset bundle. */
const UNGAG_ICON_PNG =
  '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';

const ICON_HEADERS = { 'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=86400' };

/* Every favicon path the built frontend or browsers may request. */
const FAVICON_PATHS = new Set([
  '/ungag-icon.png',
  '/favicon.ico',
  '/assets/favicon-16x16.png',
  '/assets/favicon-32x32.png',
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
      return new Response(UNGAG_ICON_PNG, { headers: ICON_HEADERS });
    }
    if (pathname.startsWith('/api/')) {
      return handleApi(pathname, request, env);
    }
    return env.ASSETS.fetch(request);
  },
};
