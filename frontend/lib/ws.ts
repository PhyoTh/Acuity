// Session WebSocket client. Connects to the FastAPI gateway and exchanges the events in plan.md §5.

export type SessionEventType =
  | "presence"
  | "code_change"
  | "chat_message"
  | "ai_response"
  | "interview_end"
  | "scorecard_ready"
  | "paste" // candidate -> server: large paste detected
  | "paste_flag" // server -> interviewer: cheat flag
  | "code_run" // server -> session: run summary
  | "token_budget" // server -> session: AI token-budget usage state
  | "pushback" // server -> interviewer: suggested questions
  | "participants" // server -> session: current participant list (with admit state)
  | "admit" // interviewer -> server: admit a waiting candidate
  | "kick" // interviewer -> server: remove a participant
  | "kicked"; // server -> session: participant was removed (target self-closes)

export interface SessionEvent<T = Record<string, unknown>> {
  type: SessionEventType;
  payload: T;
}

export class SessionSocket {
  private ws: WebSocket | null = null;

  constructor(
    private readonly sessionId: string,
    private readonly token: string,
  ) {}

  connect(handlers: {
    onEvent: (event: SessionEvent) => void;
    onOpen?: () => void;
    onClose?: () => void;
  }): void {
    const base = process.env.NEXT_PUBLIC_WS_URL!;
    const url = `${base}/ws/sessions/${this.sessionId}?token=${encodeURIComponent(this.token)}`;
    this.ws = new WebSocket(url);
    this.ws.onopen = () => handlers.onOpen?.();
    this.ws.onclose = () => handlers.onClose?.();
    this.ws.onmessage = (ev) => {
      try {
        handlers.onEvent(JSON.parse(ev.data) as SessionEvent);
      } catch {
        // ignore malformed frames
      }
    };
  }

  send(type: SessionEventType, payload: Record<string, unknown>): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type, payload }));
    }
  }

  close(): void {
    this.ws?.close();
    this.ws = null;
  }
}
