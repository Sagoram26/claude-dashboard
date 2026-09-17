import type { ServerEvent, SessionState } from '../../server/protocol.ts';

export type ChatMessage = {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  streaming: boolean;
};

export type AppState = {
  messages: ChatMessage[];
  status: SessionState['status'];
  toolActivityCount: number;
};

export const initialState: AppState = {
  messages: [],
  status: 'idle',
  toolActivityCount: 0,
};

export function reduceEvent(state: AppState, event: ServerEvent): AppState {
  switch (event.type) {
    case 'message.delta': {
      const index = state.messages.findIndex((m) => m.id === event.messageId);
      if (index === -1) {
        return {
          ...state,
          messages: [
            ...state.messages,
            { id: event.messageId, role: 'assistant', text: event.text, streaming: true },
          ],
        };
      }
      const messages = [...state.messages];
      const existing = messages[index];
      if (!existing) return state;
      messages[index] = { ...existing, text: existing.text + event.text };
      return { ...state, messages };
    }

    case 'message.complete': {
      const index = state.messages.findIndex((m) => m.id === event.messageId);
      const settled: ChatMessage = {
        id: event.messageId,
        role: event.role,
        text: event.text,
        streaming: false,
      };
      if (index === -1) return { ...state, messages: [...state.messages, settled] };
      const messages = [...state.messages];
      messages[index] = settled;
      return { ...state, messages };
    }

    case 'tool.activity':
      return { ...state, toolActivityCount: state.toolActivityCount + 1 };

    case 'session.state':
      return { ...state, status: event.state.status };

    default:
      return state;
  }
}
