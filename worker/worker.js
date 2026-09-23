/**
 * Cloudflare demo backend for the UNGAG-chat frontend.
 *
 * Serves the built frontend from the ASSETS binding and answers the
 * API surface the client needs to boot without a real server: a fake
 * logged-in user (no login screen), empty conversations, and a canned
 * reply stream when a message is sent. Not a real backend.
 */

const JSON_HEADERS = { 'Content-Type': 'application/json' };

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
  appTitle: 'UNGAG Chat (demo)',
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
    label: 'OpenAI (demo)',
    order: 0,
    disabled: false,
    welcomeForm: undefined,
  },
};

const MODELS_CONFIG = { openAI: ['demo-gpt'] };

const CANNED_REPLY =
  'Cześć! To jest tryb demo hostowany na Cloudflare - brak tu prawdziwego modelu AI i bazy danych. ' +
  'Interfejs dziala w pelni, ale odpowiedzi sa przygotowane z gory. ' +
  'Aby uruchomic prawdziwy czat, nalezy podlaczyc backend zgodnie z planem (Hugging Face + MongoDB Atlas).';

function conversationResponse() {
  return { conversations: [], page: 1, pages: 1, pageNumber: 0, pageSize: 10, total: 0 };
}

function sseResponse() {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
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
          model: 'demo-gpt',
          isCreatedByUser: false,
          sender: 'Demo',
          unfinished: true,
          error: false,
        },
        initial: true,
        conversation: { conversationId, title: 'Demo conversation' },
      });
      const chunks = CANNED_REPLY.match(/.{1,40}/g) || [];
      let i = 0;
      const timer = setInterval(() => {
        if (i < chunks.length) {
          send({ message: chunks[i], initial: false });
          i += 1;
        } else {
          clearInterval(timer);
          send({ final: true, message: '', conversation: { conversationId } });
          controller.close();
        }
      }, 60);
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

function handleApi(pathname) {
  switch (pathname) {
    case '/api/user':
      return json(USER);
    case '/api/user/terms':
      return json({ termsAccepted: true });
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
      return json({ tags: [] });
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
    return sseResponse();
  }
  return json({});
}

export default {
  async fetch(request, env) {
    const { pathname } = new URL(request.url);
    if (pathname === '/health') {
      return json({ message: 'demo', status: 'ok' });
    }
    if (pathname.startsWith('/api/')) {
      return handleApi(pathname);
    }
    return env.ASSETS.fetch(request);
  },
};
