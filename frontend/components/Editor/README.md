# components/Editor

Monaco editor wrapper for the candidate IDE.

Wraps `@monaco-editor/react`, emits debounced `code_change` events over `lib/ws.ts`, reports paste
lengths for cheat detection, and exposes the current code/language to the chat box for AI context.
See plan.md §6.
