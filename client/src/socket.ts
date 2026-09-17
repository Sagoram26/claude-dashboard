import type { ClientCommand, ServerEvent } from '../../server/protocol.ts';

export type Connection = {
  send(command: ClientCommand): void;
  close(): void;
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

  return {
    send(command) {
      if (socket.readyState === 1 /* WebSocket.OPEN */) socket.send(JSON.stringify(command));
    },
    close() {
      socket.close();
    },
  };
}
