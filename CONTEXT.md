# Archeion

Archeion is a personal second brain for notes, learning materials, and reference files. Its language keeps user-owned Markdown notes distinct from uploaded source material.

## Language

**Vault**:
The personal collection of notes and attachments owned by one person.
_Avoid_: Library, workspace, drive

**Note**:
A Markdown document in the Vault that is directly editable as plain text.
_Avoid_: Record, page, document

**Attachment**:
An original file added to the Vault that is kept in its native format.
_Avoid_: Note, resource

**Vault item**:
An item visible in the Vault, either a Note or an Attachment.
_Avoid_: File when the distinction matters

**Index**:
The searchable metadata view of Vault items maintained in PostgreSQL.
_Avoid_: Source of truth
