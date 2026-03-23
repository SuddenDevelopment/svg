# Agent Notes

## UI Semantics

- When a control switches between peer views like Overview, Warnings, and Selection, implement it as a real tab interface rather than button-styled toggles.
- Use `role="tablist"` on the container, `role="tab"` on each trigger, and `role="tabpanel"` on the active content region.
- Each tab must expose `aria-selected`, `aria-controls`, and a stable `id`; each tabpanel must expose `aria-labelledby` that points at the active tab.
- Support keyboard tab behavior: `ArrowLeft`/`ArrowRight` and optionally `ArrowUp`/`ArrowDown` move between tabs, while `Home` and `End` jump to the first and last tab.
- Do not reuse generic button styling for tabs when it makes the UI read like ordinary action buttons. Tabbed navigation should have distinct visual treatment.