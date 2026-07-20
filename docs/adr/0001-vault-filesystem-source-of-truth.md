# Vault files are the source of truth

Archeion stores Notes and Attachments in a user-owned Vault on disk, with Markdown as the default Note format. PostgreSQL holds a rebuildable Index of metadata rather than the canonical file contents, so notes stay portable and editable outside the application while the app retains structured querying later.
