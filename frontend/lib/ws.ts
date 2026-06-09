// Session WebSocket client. Connects to the FastAPI gateway and exchanges the events documented in CLAUDE.md.

export type SessionEventType =
  | "presence"
  | "code_change"
  | "chat_message"
  | "ai_response"
  | "interview_end"
  | "interview_ended" // server -> session: status flipped to ended, immediate (before scorecard)
  | "scorecard_ready"
  | "paste" // candidate -> server: large paste detected
  | "paste_flag" // server -> interviewer: cheat flag
  | "code_run" // server -> session: run summary
  | "token_budget" // server -> session: AI token-budget usage state
  | "pushback" // server -> interviewer: suggested questions
  | "participants" // server -> session: current participant list (with admit state)
  | "admit" // interviewer -> server: admit a waiting candidate
  | "kick" // interviewer -> server: remove a participant
  | "kicked" // server -> session: participant was removed (target self-closes)
  | "tab_switch" // candidate -> server -> interviewer: visibilitychange (hidden/visible)
  | "cursor_move" // candidate -> server -> interviewer: monaco cursor position
  | "mouse_move" // candidate -> server: heartbeat for idle detection (not broadcast live)
  | "file_change" // candidate -> server -> interviewer: multi-file edit (path, content)
  | "file_select" // candidate -> server -> interviewer: switched active file
  | "files_dirty" // server -> session: structural change (create/rename/delete) — refetch list
  | "shell_command" // candidate -> server: typed a shell command in the terminal
  | "shell_output"; // server -> session: command + stdout/stderr/exit for the terminal

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
