import type { ClientCommand, ServerEvent, SessionState } from '../../server/protocol.ts';

export type Connection = {
  send(command: ClientCommand): void;
  close(): void;
};

// Statut synthétique posé côté client : la perte de connexion est le seul état de SessionState
// que le client est mieux placé que le serveur pour connaître, puisque le serveur n'a alors plus
// de canal pour l'annoncer.
const DISCONNECTED_STATE: SessionState = {
  sessionId: null,
  cwd: '',
  status: 'disconnected',
  model: null,
  permissionMode: null,
};

export function connect(url: string, onEvent: (event: ServerEvent) => void): Connection {
  const socket = new WebSocket(url);

  socket.onmessage = (message: { data: unknown }) => {
    if (typeof message.data !== 'string') return;
    let event: ServerEvent;
    try {
      event = JSON.parse(message.data) as ServerEvent;
    } catch {
      return; // message serveur illisible : on ignore plutôt que de casser l'interface
    }
    onEvent(event);
  };

  socket.onclose = () => onEvent({ type: 'session.state', state: DISCONNECTED_STATE });
  socket.onerror = () => onEvent({ type: 'session.state', state: DISCONNECTED_STATE });

  return {
    send(command) {
      if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(command));
    },
    close() {
      socket.close();
    },
  };
}
