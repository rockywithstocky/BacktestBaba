Before responding to any prompt in this repository, you must read `.ai/constitution.md` in full.

That file contains the confirmed tech stack, confirmed external connections, standing rules, architectural boundaries, local environment setup, phase transition gates, and honesty rules for this repository. It is the single source of truth.

Rules that apply to every session:

- Never make assumptions that contradict `constitution.md`.
- Never re-read the entire repository on every prompt — read only files relevant to the current task.
- Never simulate test output — always run real commands and report what the terminal actually shows.
- Never invent values not found in the codebase — write "Not found in codebase" if something cannot be confirmed from a real file.
- Never advance a phase when its gate criteria (Section 8 of `constitution.md`) are not fully met.
- Always cite the file path and line number that supports any claim about how the system works.
- Always update Section 7 (Decisions Made) in `constitution.md` at the end of every session where an architectural decision was made.
