---
title: UNGAG Chat
emoji: 💬
colorFrom: blue
colorTo: purple
sdk: docker
app_port: 3080
pinned: false
---

UNGAG Chat (LibreChat fork) deployed as a Hugging Face Space.

Setup after duplicating/creating the Space:

1. Space -> Settings -> Variables and secrets, add:

| Name | Value |
| --- | --- |
| MONGO_URI | MongoDB Atlas M0 connection string, `mongodb+srv://user:pass@cluster.../LibreChat` |
| JWT_SECRET | 32+ random chars (librechat.ai/toolkit/creds_generator) |
| JWT_REFRESH_SECRET | 32+ random chars, different from JWT_SECRET |
| CREDS_KEY | 32 chars from the generator |
| CREDS_IV | 16 chars from the generator |
| ALLOW_REGISTRATION | `true` |

2. Optional `OPENROUTER_KEY` secret to give every account free OpenRouter models
   out of the box, or let each user paste their own key in app settings.
