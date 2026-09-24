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
    iconURL: '/ungag-icon.svg',
    order: 0,
    disabled: false,
  },
};

const MODELS_CONFIG = { openAI: ['ungag-1'] };

const UNGAG_ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#7c3aed"/>
      <stop offset="1" stop-color="#f97316"/>
    </linearGradient>
  </defs>
  <rect width="64" height="64" rx="14" fill="#0b0e14"/>
  <path d="M20 13v21a12 12 0 0 0 24 0V13" fill="none" stroke="url(#g)" stroke-width="7" stroke-linecap="round"/>
  <circle cx="32" cy="51" r="3.5" fill="url(#g)"/>
</svg>`;

const ICON_HEADERS = { 'Content-Type': 'image/svg+xml', 'Cache-Control': 'public, max-age=86400' };

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
    if (pathname === '/ungag-icon.svg' || pathname === '/favicon.ico') {
      return new Response(UNGAG_ICON_SVG, { headers: ICON_HEADERS });
    }
    if (pathname.startsWith('/api/')) {
      return handleApi(pathname, request, env);
    }
    return env.ASSETS.fetch(request);
  },
};
