---
paths:
  - app/api/ai/assistant/**
  - lib/server/assistant/**
  - components/assistant/**
---

# Assistant Workflows

- Keep thread state in `app/api/ai/assistant/threads/*` and memory in `app/api/ai/assistant/memory/route.ts`.
- Preserve SSE event shapes in `lib/server/assistant/anthropicStream.ts` and `app/api/ai/assistant/stream/route.ts`.
- Respect `AssistantMode`, `AssistantPreferences`, and `AssistantStreamEvent` in `types/assistant.ts`.
- Keep web-search policy in `lib/server/assistant/webSearchPolicy.ts` aligned with prompts.
- Update `components/assistant/*` when request modes, memory fields, or stream events change.