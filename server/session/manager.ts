import { query as realQuery } from '@anthropic-ai/claude-agent-sdk';
import type { SDKMessage, SDKUserMessage } from '@anthropic-ai/claude-agent-sdk';
import { createMessageQueue } from './queue.ts';
import type { ServerEvent, SessionState } from '../protocol.ts';

export type QueryFn = typeof realQuery;

export type SessionManagerOptions = {
  cwd: string;
  emit: (event: ServerEvent) => void;
  queryFn?: QueryFn;
};

export type SessionManager = {
  send(text: string): void;
  interrupt(): Promise<void>;
  state(): SessionState;
  stop(): Promise<void>;
};

export function createSessionManager(opts: SessionManagerOptions): SessionManager {
  const queryFn = opts.queryFn ?? realQuery;
  const queue = createMessageQueue<SDKUserMessage>();

  let state: SessionState = {
    sessionId: null,
    cwd: opts.cwd,
    status: 'idle',
    model: null,
    permissionMode: null,
  };

  const setState = (patch: Partial<SessionState>) => {
    state = { ...state, ...patch };
    opts.emit({ type: 'session.state', state });
  };

  const session = queryFn({
    prompt: queue.stream,
    options: { cwd: opts.cwd },
  });

  const pump = (async () => {
    for await (const message of session as AsyncIterable<SDKMessage>) {
      handleMessage(message);
    }
  })().catch((err: unknown) => {
    opts.emit({ type: 'error', message: err instanceof Error ? err.message : String(err) });
    setState({ status: 'disconnected' });
  });

  function handleMessage(message: SDKMessage): void {
    if (message.type === 'system' && message.subtype === 'init') {
      setState({ sessionId: message.session_id, model: message.model ?? null });
      return;
    }

    if (message.type === 'assistant') {
      const blocks = message.message.content;
      if (!Array.isArray(blocks)) return;

      const texts: string[] = [];
      for (const block of blocks) {
        if (block.type === 'text') {
          texts.push(block.text);
        } else if (block.type === 'tool_use') {
          opts.emit({
            type: 'tool.activity',
            toolUseId: block.id,
            name: block.name,
            target: describeTarget(block.input),
          });
        }
      }

      if (texts.length > 0) {
        opts.emit({
          type: 'message.complete',
          messageId: message.uuid,
          role: 'assistant',
          text: texts.join('\n'),
        });
      }
      return;
    }

    if (message.type === 'result') {
      setState({ status: 'idle', sessionId: message.session_id });
      if ('total_cost_usd' in message) {
        opts.emit({ type: 'cost.usage', totalUsd: message.total_cost_usd });
      }
    }
  }

  function describeTarget(input: unknown): string | undefined {
    if (typeof input !== 'object' || input === null) return undefined;
    const record = input as Record<string, unknown>;
    for (const key of ['file_path', 'path', 'command', 'pattern']) {
      const value = record[key];
      if (typeof value === 'string') return value;
    }
    return undefined;
  }

  return {
    send(text: string) {
      setState({ status: 'generating' });
      queue.push({
        type: 'user',
        message: { role: 'user', content: text },
        parent_tool_use_id: null,
        session_id: state.sessionId ?? '',
      } as SDKUserMessage);
    },

    async interrupt() {
      await session.interrupt();
      setState({ status: 'idle' });
    },

    state: () => state,

    async stop() {
      queue.close();
      await pump;
    },
  };
}
