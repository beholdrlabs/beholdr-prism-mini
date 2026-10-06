# Answer key (payload @ 8001944)

## P1. REST create, end to end (15 facts)

Paths are relative to the repo root; `create.ts` means
`packages/payload/src/collections/operations/create.ts` and `handleEndpoints.ts`
means `packages/payload/src/utilities/handleEndpoints.ts`.

1. The Next.js catch-all REST route exports the same `handlerBuilder` as `POST` (and `GET`, `PATCH`, `PUT`, `DELETE`, `OPTIONS`), which calls `handleEndpoints` with the path built from the slug params (`packages/next/src/routes/rest/index.ts:8-60`).
2. `handleEndpoints` builds the Payload request with `createPayloadRequestFromWebRequest` (`handleEndpoints.ts:138`), which resolves language and locale and runs `executeAuthStrategies` to set `req.user` (`packages/payload/src/utilities/createPayloadRequestFromWebRequest.ts:54`, `:126-134`).
3. Matching: the first path segment selects a global or collection (`handleEndpoints.ts:183-184`); the endpoint is found by HTTP method plus a path-to-regexp `match` on the remaining path, and `req.routeParams.collection` is set (`:226-240`); no match gives 404 (`:157`, `:266`), with a default CORS response for `OPTIONS`.
4. Built-in collection endpoints are wrapped by `wrapInternalEndpoints`, which calls `addDataAndFileToRequest` to parse the body and files into `req.data` / `req.file` before the handler (`packages/payload/src/utilities/wrapInternalEndpoints.ts:11-14`, `packages/payload/src/collections/endpoints/index.ts:26-34`).
5. `createHandler` parses query params (`depth`, `draft`, `autosave`, `select`, `populate`, `publishAllLocales`), calls `createOperation`, and responds `201` with `{ doc, message }` and CORS headers (`packages/payload/src/collections/endpoints/create.ts:11-43`).
6. Transactions: `createOperation` starts one unless disabled (`create.ts:87`), commits at the end (`:620`), and kills it on error (`:632`); adapters pick up the transaction from `req` (Drizzle `getTransaction`, Mongo `getSession`).
7. Collection `beforeOperation` hooks run first (`create.ts:134-148`).
8. Access: unless `overrideAccess`, `executeAccess` runs the collection's `access.create` with `data` (`create.ts:226-231`) and throws `Forbidden` when denied (`packages/payload/src/auth/executeAccess.ts:29`, `:41`).
9. Uploads: `generateFileData` prepares file data and sizes before hooks (`create.ts:237`), and `uploadFiles` writes them before the database insert unless local storage is disabled (`:440-442`); temp files are unlinked at the end or on error.
10. Hook order before the write: field `beforeValidate` (`create.ts:255`), collection `beforeValidate` (`:293-309`), collection `beforeChange` (`:311-329`), field `beforeChange` (`:331`).
11. Validation runs inside the field `beforeChange` traversal (`packages/payload/src/fields/hooks/beforeChange/promise.ts:184`) and throws `ValidationError` (`.../beforeChange/index.ts:86`); it is skipped when saving a draft unless draft validation is enabled (`create.ts:352`).
12. Drafts and versions: a draft save sets `_status: 'draft'` (`create.ts:190-193`); collections with versions get `saveVersion` after the write (`:498`).
13. The write: auth collections with the local strategy go through `registerLocalStrategy` (password hashing) (`create.ts:467`), others call `payload.db.create` (`:475`); Drizzle adapters (Postgres/SQLite) implement `create` with `upsertRow` (`packages/drizzle/src/create.ts:11-35`), MongoDB with `Model.create` in the request's session (`packages/db-mongodb/src/create.ts:52-58`). Auth collections with `verify` then send a verification email (`create.ts:515`).
14. Hook order after the write: field `afterRead` (`create.ts:527`), collection `afterRead` (`:547`), field `afterChange` (`:564`), collection `afterChange` (`:579`), then `afterOperation` (`:600-603`).
15. Errors are caught in `handleEndpoints` and turned into HTTP responses by `routeError` (`handleEndpoints.ts:281`, `packages/payload/src/utilities/routeError.ts:15`).
