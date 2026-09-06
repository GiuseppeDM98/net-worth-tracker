import { afterEach, describe, expect, it, vi } from 'vitest';
import Anthropic from '@anthropic-ai/sdk';
import type { AssistantPreferences } from '@/types/assistant';

vi.mock('server-only', () => ({}));

import { streamAssistantResponse } from '@/lib/server/assistant/anthropicStream';

const OVERLOADED_MESSAGE = 'I server AI sono temporaneamente sovraccarichi. Riprova tra qualche secondo.';

const preferences: AssistantPreferences = {
  responseStyle: 'balanced',
  includeMacroContext: false,
  memoryEnabled: false,
  includeDummySnapshots: false,
};

// The envelope the API returns on a 529, exactly as the SDK receives it.
const OVERLOADED_ENVELOPE = {
  type: 'error',
  error: { type: 'overloaded_error', message: 'Overloaded' },
};

/**
 * Runs a chat turn whose upstream call rejects with `failure`. The SDK client is built at
 * module load, so the rejection is injected on the shared `Messages.prototype.create`.
 */
function streamWithUpstreamFailure(failure: unknown) {
  vi.spyOn(Anthropic.Messages.prototype, 'create').mockRejectedValue(failure);
  return streamAssistantResponse({
    mode: 'chat',
    prompt: 'Come sta andando il mese?',
    contextBundle: null,
    preferences,
    enableWebSearch: false,
    onStatus: vi.fn(),
    onText: vi.fn(),
  });
}

describe('streamAssistantResponse upstream failures', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('maps the real SDK overload error to a retryable 503', async () => {
    // Regression: with sdk 0.110 the inner type lives on `error.type` and `error.error` is
    // the whole envelope, so a read of `error.error.type` saw 'error' and never matched.
    const sdkError = Anthropic.APIError.generate(529, OVERLOADED_ENVELOPE, 'Overloaded', new Headers());
    expect(sdkError).toBeInstanceOf(Anthropic.APIError);

    await expect(streamWithUpstreamFailure(sdkError)).rejects.toMatchObject({
      message: OVERLOADED_MESSAGE,
      retryable: true,
      status: 503,
    });
  });

  it('still maps the raw envelope shape the mocks throw', async () => {
    const rawEnvelope = { error: { type: 'overloaded_error', message: 'Overloaded' } };

    await expect(streamWithUpstreamFailure(rawEnvelope)).rejects.toMatchObject({
      message: OVERLOADED_MESSAGE,
      retryable: true,
      status: 503,
    });
  });

  it('rethrows any other SDK failure untouched', async () => {
    const sdkError = Anthropic.APIError.generate(
      500,
      { type: 'error', error: { type: 'api_error', message: 'Boom' } },
      undefined,
      new Headers()
    );

    await expect(streamWithUpstreamFailure(sdkError)).rejects.toBe(sdkError);
  });
});
