// Room WebSocket client. Connects to the FastAPI gateway and exchanges the events in plan.md §5.

export type RoomEventType =
  | "presence"
  | "code_change"
  | "chat_message"
  | "ai_response"
  | "interview_end"
  | "scorecard_ready"
  | "paste" // candidate -> server: large paste detected
  | "paste_flag" // server -> recruiter: cheat flag
  | "code_run" // server -> room: run summary
  | "quota" // server -> room: AI query quota state
  | "pushback"; // server -> recruiter: suggested questions

export interface RoomEvent<T = Record<string, unknown>> {
  type: RoomEventType;
  payload: T;
}

export class RoomSocket {
  private ws: WebSocket | null = null;

  constructor(
    private readonly roomId: string,
    private readonly token: string,
  ) {}

  connect(handlers: {
    onEvent: (event: RoomEvent) => void;
    onOpen?: () => void;
    onClose?: () => void;
  }): void {
    const base = process.env.NEXT_PUBLIC_WS_URL!;
    const url = `${base}/ws/rooms/${this.roomId}?token=${encodeURIComponent(this.token)}`;
    this.ws = new WebSocket(url);
    this.ws.onopen = () => handlers.onOpen?.();
    this.ws.onclose = () => handlers.onClose?.();
    this.ws.onmessage = (ev) => {
      try {
        handlers.onEvent(JSON.parse(ev.data) as RoomEvent);
      } catch {
        // ignore malformed frames
      }
    };
  }

  send(type: RoomEventType, payload: Record<string, unknown>): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type, payload }));
    }
  }

  close(): void {
    this.ws?.close();
    this.ws = null;
  }
}
