// Double de test unique pour `WebSocket`, partagé par les tests client.
// Couvre les besoins observés dans socket.test.ts et Session.test.tsx :
// capture des messages envoyés, readyState, onmessage/onclose/onerror, close().
export class FakeWebSocket {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;

  static instances: FakeWebSocket[] = [];

  sent: string[] = [];
  readyState: number = FakeWebSocket.OPEN;
  onmessage: ((e: { data: string }) => void) | null = null;
  onopen: (() => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;

  constructor(public url: string) {
    FakeWebSocket.instances.push(this);
  }

  send(payload: string) {
    this.sent.push(payload);
  }

  close() {
    this.readyState = FakeWebSocket.CLOSED;
  }
}
