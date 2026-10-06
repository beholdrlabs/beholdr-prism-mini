# Tasks: Payload scaling check

Subject: [payloadcms/payload](https://github.com/payloadcms/payload) at
`8001944` (about 453k lines of TypeScript excluding tests, about 16× lore).
One task, arms A and C, one run each. Routing lines as in [../tasks.md](../tasks.md).

## P1. REST create, end to end (broad)

> In this repository, trace what happens when a client creates a document
> with a REST `POST /api/<collection-slug>` request, from the Next.js route
> handler to the database write and back to the HTTP response. Cover how the
> request is matched to a handler, how the request body and the authenticated
> user are attached, every access check, the order of collection and field
> hooks, where validation runs and when it is skipped, how uploads,
> versions/drafts, and auth collections change the flow, how the database
> adapters perform the write, transactions, and how errors become HTTP
> responses.
