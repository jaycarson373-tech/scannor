import { afterEach, describe, expect, it, vi } from 'vitest';

const parse = vi.fn();
vi.mock('@anthropic-ai/sdk', () => {
  class APIError extends Error { status = 500; }
  class AuthenticationError extends APIError {}
  class RateLimitError extends APIError {}
  class Anthropic { beta = { messages: { parse } }; static APIError = APIError; static AuthenticationError = AuthenticationError; static RateLimitError = RateLimitError; }
  return { default: Anthropic };
});

const { claudeIdeas, buildPrompt } = await import('../src/engine/llm.js');
const input = { runners: [], narratives: [], threads: [], kym: [{ slug: 'le-toucan', title: 'Le Toucan', list: 'popular' as const, url: 'https://knowyourmeme.com/memes/le-toucan' }] };

afterEach(() => {
  parse.mockReset();
  delete process.env.ANTHROPIC_API_KEY;
});

describe('claudeIdeas', () => {
  it('is a no-op without credentials', async () => {
    const r = await claudeIdeas(input);
    expect(r.ok).toBe(false);
    expect(parse).not.toHaveBeenCalled();
  });

  it('maps parsed ideas, normalising tickers and clamping conviction', async () => {
    process.env.ANTHROPIC_API_KEY = 'test';
    parse.mockResolvedValue({
      model: 'claude-opus-5-5',
      stop_reason: 'end_turn',
      parsed_output: { ideas: [{ kind: 'beta', name: 'Jimmy Rustled', ticker: '$rustled', parent_runner: 'JIMMY', angle: 'a', why_now: 'w', evidence: ['e'], art: 'x', first_tweet: 't', risk: 'r', conviction: 1.7 }] },
    });
    const r = await claudeIdeas(input);
    expect(r.ok).toBe(true);
    expect(r.ideas[0]).toMatchObject({ id: 'beta:jimmyrustled', ticker: 'RUSTLED', parent: 'JIMMY', conviction: 1, source: 'claude' });
    const req = parse.mock.calls[0][0];
    expect(req.model).toBe('claude-opus-5-5');
    expect(req.fallbacks).toBe('default');
    expect(req.output_config.effort).toBe('medium');
  });

  it('treats a refusal as no ideas rather than an error', async () => {
    process.env.ANTHROPIC_API_KEY = 'test';
    parse.mockResolvedValue({ model: 'm', stop_reason: 'refusal', parsed_output: null });
    expect((await claudeIdeas(input)).ideas).toEqual([]);
  });

  it('puts the scan evidence in the prompt', () => {
    expect(buildPrompt(input)).toContain('knowyourmeme.com/memes/le-toucan');
  });
});
