# components/Chat

AI chat box for the candidate (and a read-only mirror on the interviewer dashboard).

Renders the transcript, sends `chat_message` over the session WebSocket, streams `ai_response`. The
candidate never sees the `was_hallucinated` flag; the interviewer's mirror does. See plan.md §5.
