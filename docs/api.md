# API Reference

What our endpoints actually accept and return today, read straight from the
route/controller/service code (not from what they were originally meant to
do). If behavior described here looks wrong, the fix is either the code or
this doc - open an issue rather than silently diverging from it again.

All routes are mounted under the base path `/api` (see `src/app.ts`), so the
full path for `/tag/add` is `POST /api/tag/add`.

## Authentication

Every route below (except where noted) is protected by the
`authenticateUser` middleware (`src/middlewares/auth.middleware.ts`). Send a
JWT as a Bearer token:

```
Authorization: Bearer <token>
```

If the header is missing, malformed, or the token fails to verify, the
request never reaches the controller. You get one of:

```jsonc
// 401 - no/empty token
{ "message": "Authenticated users only" }
```

```jsonc
// 401 - token invalid/expired
{ "message": "Please login again" }
```

Note these auth failures do **not** include a `status` field, unlike the
standard shape below - see "Known inconsistencies".

## Standard response shape (BE-14)

**Success** - almost every handler returns:

```jsonc
{
  "status": "success",
  "data": {}, // shape depends on the endpoint, see below
  "message": "human-readable description"
}
```

**Error** - anything that reaches `next(new HttpException(status, message))`
is caught by the global error handler (`src/middlewares/error.middleware.ts`)
and produces:

```jsonc
{
  "status": "error",
  "message": "human-readable description"
}
```

with the HTTP status code taken from the `HttpException` (controllers in
this codebase currently always construct it with `400`, regardless of the
actual failure - see below).

A route that doesn't match anything returns:

```jsonc
// 404
{ "status": "error", "message": "You just hit a resource that does not exist" }
```

### Known inconsistencies (as of this writing)

This is what's actually in the code, not what's intended. Frontend should
treat all of these as "error", but can't rely on the shape being identical:

- Auth failures (`401`) return `{ "message": "..." }` with no `status` field.
- Several handlers validate and reject a bad request directly with
  `res.status(400).send({ status: "error", message: "..." })` instead of
  going through `HttpException` - same shape, but bypasses the shared error
  handler.
- A few older handlers (`GET /model/get-models`, `GET /model/get-softed-models`
  when `userId` is missing) send `{ "error": "User not found" }` - no
  `status` field, and the key is `error` instead of `message`.
- `TagController.updateTag`, `TagController.deleteTag` and
  `TagController.deleteModelTags` catch their own errors and `return
  { error: error.message }` instead of calling `res.json(...)` or
  `next(...)`. Express does not serialize a handler's return value, so on
  failure these requests just hang until the client's own timeout - there is
  no error response to parse. This is a real bug, not a documented shape;
  flagging it here so it isn't rediscovered as "the API sometimes doesn't
  respond."
- Every `HttpException` in `tags.controller.ts` and most of
  `model.controller.ts` is thrown with status `400`, even for failures that
  are really "not found" (404) or "server error" (500). The HTTP status code
  is not a reliable signal of what went wrong today - read `message`.

## Tag endpoints (`src/resources/tags`)

### `POST /tag/add`

Adds a tag (an incident or a sampling record) to a model. `multipart/form-data`
(the route runs `multer` with `evidence` and `model` file fields).

**Body fields** (form fields, all strings unless noted):

| Field | Required | Notes |
|---|---|---|
| `userId` | yes | tag author |
| `modelId` | yes | which model this tag belongs to |
| `type` | yes | `"incident"` or `"sampling"` |
| `objectName` | recommended | display name shown in the UI |
| `objectId` | recommended | objectRef contract - see `/docs/object-ref-contract.md` |
| `objectPath` | recommended | objectRef contract |
| `meshName` | recommended | objectRef contract, debugging only |
| `taggedInfo` | recommended | JSON blob carrying tag position + camera state (and, today, a copy of `objectId`/`objectPath`/`meshName`/`meshName` - see the contract doc) |
| `incident` | if `type: "incident"` | |
| `sample` | if `type: "sampling"` | |
| `presence` | if `type: "sampling"` | `"positive"` \| `"negative"`, defaults to `"negative"` if omitted |
| `action`, `locations`, `zone`, `sampleDetails`, `group`, `text` | no | optional metadata |
| `evidence` | no | file upload |

**Success (`200`)**:

```jsonc
{
  "status": "success",
  "data": {
    "_id": "66f1a2b3c4d5e6f7a8b9c0d1",
    "objectName": "Conveyor 3",
    "objectId": "092022f163babaa9",
    "objectPath": "Building A/Room 1/Conveyor 3",
    "meshName": "Group#189",
    "type": "sampling",
    "sample": "665f...",
    "presence": "negative",
    "locations": "Zone 1",
    "user": "665a...",
    "model": "665b...",
    "taggedInfo": "{\"tagPosition\":{...},\"cameraPosition\":{...}}",
    "slug": "SAM-1758150000",
    "createdAt": "2026-09-18T10:00:00.000Z",
    "updatedAt": "2026-09-18T10:00:00.000Z"
  },
  "message": "tag added successfully"
}
```

**Failure**:

```jsonc
// 400 - missing/invalid userId or modelId (thrown as "Invalid User or Model")
{ "status": "error", "message": "Invalid User or Model" }
```

```jsonc
// 200 (not 4xx - see known inconsistencies) - userId missing entirely
"please login into the app"
```
The last one is sent with `res.status(400).send(...)` as a **plain string**,
not JSON - note this if you're parsing responses generically.

### `GET /tag/all-tags`

Returns every tag the caller is allowed to see (all tags for a super admin,
otherwise only tags on models in the user's allowed locations).

**Query params**: none.

**Success (`200`)**:

```jsonc
{
  "status": "success",
  "message": "All tags", // or "Filtered tags based on user's allowed locations"
  "data": [
    {
      "_id": "66f1a2b3c4d5e6f7a8b9c0d1",
      "objectName": "Conveyor 3",
      "objectId": "092022f163babaa9",
      "objectPath": "Building A/Room 1/Conveyor 3",
      "type": "sampling",
      "user": { "_id": "665a...", "fullname": "Jane Doe" },
      "sample": { "_id": "665f...", "name": "Listeria" },
      "model": { "_id": "665b...", "modelName": "Plant 4", "location": { "_id": "...", "name": "Plant 4" } },
      "createdAt": "2026-09-18T10:00:00.000Z"
    }
  ]
}
```

**Failure**:

```jsonc
// 400
{ "error": "User not found" } // note: no "status" field, see known inconsistencies
```

### `GET /tag/paginated-tags`

Same data as `all-tags`, paged and searchable.

**Query params**:

| Param | Default | Notes |
|---|---|---|
| `page` | `1` | 1-indexed |
| `limit` | `25` | page size |
| `search` | - | case-insensitive match across `objectName`, `incident`, `presence`, `sample`, `locations`, `text`, `type`, `group`, `slug`, plus the tagging user's `fullname` and (for super admins) the model's `modelName` |
| `startDate`, `endDate` | - | both required together; filters by `createdAt`, inclusive, whole-day range |

**Success (`200`)**:

```jsonc
{
  "status": "success",
  "message": "Paginated tags",
  "data": {
    "items": [ /* same tag shape as all-tags */ ],
    "total": 137,
    "page": 1,
    "limit": 25
  }
}
```

**Failure**: same as `all-tags`.

### `PUT /tag/update-tag/:id`

Updates a tag. `multipart/form-data`, same file fields as `add`.

**Body fields**: any of `incident`, `frequency`, `locations`, `sample`,
`userId`, `modelId`, `taggedInfo`, `objectName`, `objectId`, `objectPath`,
`meshName`, `text`, `presence`, `type`, `action` - all optional, only
provided fields are changed (this is a `findByIdAndUpdate`, not a merge of
required fields).

**Success (`200`)**:

```jsonc
{
  "message": "tag updated successfully",
  "data": { /* the tag document as it was *before* the update - findByIdAndUpdate
              defaults to returning the pre-update document */ }
}
```
Note: no `status` field on this one, and `data` is the *old* document, not
the updated one - a caller that immediately re-renders from this response
will show stale values until it re-fetches.

**Failure**: see "known inconsistencies" - this handler returns
`{ error: error.message }` from the catch block, which never reaches the
client. A failed update currently just times out.

### `DELETE /tag/tags-delete/:id`

Deletes one tag by id.

**Success (`200`)**:

```jsonc
{ "message": "tag deleted successfully" }
```

**Failure**: same as `update-tag` - errors don't reach the client today.

### `DELETE /tag/delete-model-tags/:id`

Deletes every tag belonging to model `:id`, and resets the model's `tags`
array (to a single freshly-generated, meaningless ObjectId - not `[]` -
that's what the current implementation does).

**Success (`200`)**:

```jsonc
{ "message": "successfully", "data": undefined }
```
(`data` is whatever `deleteModelTags`'s service function returns, which is
nothing - the field is present but always `undefined`.)

**Failure**: same as `update-tag` - errors don't reach the client today.

---

## Model endpoints (`src/resources/models`)

### `POST /model/create-models`

Uploads a new model. `multipart/form-data` with `image` (cover photo),
`model` (the 3D file), and optionally `twoD` (a 2D floor-plan image).

**Body fields**: `modelName`, `description` (both required),
`userId`, `location` (both required), `size` (bytes, optional),
`isComplete` (optional boolean, applied in a follow-up update after create).

**Success (`200`)**:

```jsonc
{
  "status": "success",
  "message": "Model upload",
  "data": {
    "_id": "665b...",
    "modelName": "Plant 4",
    "description": "Main packaging floor",
    "slug": "FAC-4821",
    "file": "https://.../models/jane/Plant%204/model.glb",
    "coverPicture": "https://.../coverPhoto/jane/cover.png",
    "size": 14272828,
    "isComplete": false,
    "location": "665c...",
    "delete": false,
    "tags": [],
    "createdAt": "2026-09-18T10:00:00.000Z"
  }
}
```

**Failure**:

```jsonc
// 400
{ "status": "error", "message": "No files were uploaded." }
```
Note: the `modelName`/`description`/`userId`/`location` checks call
`res.status(400).send(...)` but do **not** `return` immediately after -
execution falls through and the handler can still attempt the upload and
send a second response afterwards. In practice this throws
`ERR_HTTP_HEADERS_SENT` on the server rather than cleanly rejecting; treat a
missing required field as undefined behavior until this is fixed, not as a
documented 400.

### `POST /model/create-coverPhoto`

Currently a no-op - the handler body is entirely commented out. It accepts
the request (multipart, `image` field) and always returns nothing
(`200` with an empty body) unless the file check itself throws. Do not build
against this endpoint yet.

### `GET /model/get-models`

Lists all non-deleted models visible to the caller (all of them for a super
admin, otherwise only those in the user's allowed locations).

**Success (`200`)**:

```jsonc
{
  "status": "success",
  "message": "all models",
  "data": [
    {
      "_id": "665b...",
      "modelName": "Plant 4",
      "slug": "FAC-4821",
      "coverPicture": "https://.../cover.png",
      "location": { "_id": "665c...", "name": "Plant 4" },
      "delete": false,
      "createdAt": "2026-09-18T10:00:00.000Z"
    }
  ]
}
```

**Failure**:

```jsonc
// 400
{ "error": "User ID not found" } // no "status" field
```

### `GET /model/get-softed-models`

Same as `get-models` but for soft-deleted models (`delete: true`). Same
request/response shape, `message: "soft deleted models"`.

### `GET /model/restore-softed-models/:id`

Restores one soft-deleted model (sets `delete: false`).

**Success (`200`)**:

```jsonc
{ "status": "success", "message": "model restored", "data": { /* updated model, pre-update doc - see findByIdAndUpdate note above */ } }
```

### `POST /model/restore-softed-models`

Bulk restore. Body: `{ "modelIds": ["665b...", "665c..."] }`.

**Success (`200`)**:

```jsonc
{ "status": "success", "message": "model restored successfully", "data": { "acknowledged": true, "matchedCount": 2, "modifiedCount": 2 } }
```

**Failure**:

```jsonc
// 400
{ "status": "error", "message": "Invalid or empty model IDs provided" }
```

### `GET /model/get-a-models/:id?`

Gets one model, populated with its tags (each tag further populated with
`user`, `sample`, `incident`), its `location`, and its `gTags`.

**Success (`200`)**:

```jsonc
{
  "status": "success",
  "message": "get a model",
  "data": {
    "_id": "665b...",
    "modelName": "Plant 4",
    "file": "https://.../model.glb",
    "location": { "_id": "665c...", "name": "Plant 4" },
    "tags": [
      {
        "_id": "66f1...",
        "objectName": "Conveyor 3",
        "objectId": "092022f163babaa9",
        "objectPath": "Building A/Room 1/Conveyor 3",
        "user": { "_id": "665a...", "fullname": "Jane Doe" },
        "sample": { "_id": "665f...", "name": "Listeria" }
      }
    ],
    "gTags": []
  }
}
```

**Failure**: when the id doesn't match a model, the service returns
`{ error: "Model not found" }` as its *resolved value* - the controller
does not check for this and sends it as `data` inside a normal `200`
success envelope:

```jsonc
// 200 (not 404 - this is a real gap, not a design choice)
{ "status": "success", "message": "get a model", "data": { "error": "Model not found" } }
```
Callers must check `data.error` on this endpoint, not just the HTTP status
or top-level `status` field.

### `DELETE /model/delete-a-models/:id?`

Hard-deletes a model (and its cover photo from S3/disk, and all of its
tags).

**Success (`200`)**:

```jsonc
{ "status": "success", "message": "model deleted successfully" }
```

Same "not found" caveat as `get-a-models` applies here in principle, but
since this handler doesn't forward the service's return value at all, a
delete of a nonexistent id still reports success.

### `POST /model/soft-delete-models`

Body: `{ "modelIds": ["665b...", "665c..."] }`. Sets `delete: true` on each.

**Success (`200`)**:

```jsonc
{ "status": "success", "message": "model moved to recycle bin", "data": { "acknowledged": true, "matchedCount": 2, "modifiedCount": 2 } }
```

**Failure**: same shape as `restore-softed-models`.

### `DELETE /model/delete-models`

Routed to the same handler as `delete-a-models` (`deletAModel`), **not** the
`deleteMultipleModels` service - despite the route comment claiming it
deletes multiple models, it currently expects a single `:id` and this route
has no `:id` param, so `id` is always `undefined` and this endpoint cannot
work as written. Do not build against this until it's fixed.

### `GET /model/get-updated-models`

**Query params**: `startTime`, `endTime` (parsed with `new Date(...)`, so
ISO 8601 strings).

**Success (`200`)**:

```jsonc
{ "data": [ /* array of model documents updated in the window, unpopulated */ ] }
```
Note: no `status` or `message` field on this one - it's a bare `{ data }`.

**Failure**:

```jsonc
// 500
{ "status": "error", "message": "Failed to fetch updated models" }
```

### `POST /model/update-model/:id`

`multipart/form-data`. Updates `modelName`, `description`, `location`,
`isComplete`, and optionally re-uploads `image` (cover photo) and/or `twoD`.

**Success (`200`)**:

```jsonc
{ "model": { /* updated-model args passed to findByIdAndUpdate; same pre-update-doc caveat */ } }
```
Note: no `status` or `message` field here either - just `{ model }`.

**Failure**:

```jsonc
// 404
{ "status": "error", "message": "Model not found" }
```
```jsonc
// 400
{ "status": "error", "message": "Model ID is required" }
```
```jsonc
// 400
{ "status": "error", "message": "Cover picture is required" }
```
```jsonc
// 500
{ "status": "error", "message": "Failed to upload image to S3", "error": "..." }
```

### Object groups (`/model/:modelId/object-group`)

A sub-resource for saved camera viewpoints/groupings on a model.

#### `POST /model/:modelId/object-group`

Body: `{ "name": "string", "cameraPosition": {x,y,z}, "cameraDirection": {x,y,z}, "cameraRotation": {x,y,z} }` (all required).

**Success (`201`)**:

```jsonc
{
  "_id": "665d...",
  "name": "Zone 2 overview",
  "cameraPosition": { "x": 1.2, "y": 0.5, "z": -3.1 },
  "cameraDirection": { "x": 0, "y": 0, "z": 1 },
  "cameraRotation": { "x": 0, "y": 1.57, "z": 0 },
  "modelId": "665b...",
  "createdAt": "2026-09-18T10:00:00.000Z"
}
```
Note: this response has no envelope at all - not `{ status, data, message }`,
just the raw saved document. This endpoint predates the standard shape.

**Failure**:

```jsonc
// 404
{ "message": "Model not found" }
```
```jsonc
// 500
{ "status": "error", "message": "Internal server error" }
```

#### `GET /model/:modelId/object-group`

**Success (`200`)**: a raw array, same no-envelope pattern:

```jsonc
[
  { "_id": "665d...", "name": "Zone 2 overview", "cameraPosition": {...}, "cameraDirection": {...}, "cameraRotation": {...}, "modelId": "665b..." }
]
```

**Failure**: same as create.

#### `DELETE /model/:modelId/object-group/:objectGroupId`

**Success (`200`)**:

```jsonc
{ "message": "Object group deleted" }
```

**Failure**:

```jsonc
// 404
{ "message": "Model not found" } // or "Object group not found"
```
```jsonc
// 500
{ "status": "error", "message": "Internal server error" }
```

---

## Planned endpoints (not yet built)

The issue that requested this doc (`Write down what our API sends and
receives`, #2) asks for two new endpoints to be documented here ahead of
implementation, so the frontend can build against them at the same time.
Both are now scoped as tickets (BE-09, BE-10, replacing the earlier
`T-BE09`/`T-BE10` placeholders) - but **neither is implemented yet**.
Everything below is the ticket's spec, not something read from code like the
rest of this document. Do not build against either of these until the
ticket ships and this note is removed.

### BE-09 - `GET /tag/by-object` (not yet built)

*P0 - Phase 2 - 1 day - needs BE-01, BE-07*

**Why**: this is the "click machine → see its test records" direction. The
frontend cannot build it without this.

**What it does**: returns the tag/records for one machine (`modelId` +
`objectId`), newest first, paged. Must respect the caller's role and allowed
locations, the same way `all-tags`/`paginated-tags` do.

**Query params**:

| Param | Required | Notes |
|---|---|---|
| `modelId` | yes | which model the machine belongs to |
| `objectId` | yes | identifies the machine - objectRef contract, see `/docs/object-ref-contract.md` |
| `page` | no | 1-indexed |
| `limit` | no | page size |

**Response shape**: not pinned down beyond "records for that machine, newest
first, with paging" - the existing `paginated-tags` envelope
(`{ status, data: { items, total, page, limit }, message }`, sorted by
`createdAt` descending) is the obvious model to reuse for consistency.

Note: today's `Tag` schema (`tags.model.ts`) has no `objectId` field or
index at all - `objectId` currently only exists as a copy inside the
`taggedInfo` JSON blob (see `POST /tag/add` above). The acceptance criteria
below (`.explain()` using an `objectRef.objectId` index) implies a real
schema/index change, which is presumably what BE-01/BE-07 provide.

**How we know it's done** (from the ticket):
- [ ] Returns every record for the planted test machine, and nothing
      belonging to a nearby machine with a similar name - i.e. must match on
      `objectId`, never on `objectName`
- [ ] Works correctly when one machine has 1,000 records
- [ ] `.explain()` shows it uses the `objectRef.objectId` index
- [ ] A machine with no records returns an empty list with status `200` -
      not `404`

### BE-10 - `GET /tag/:id/locate` (not yet built)

*P0 - Phase 2 - half a day - needs BE-01*

**Why**: this is the "open a test record → jump to that machine in 3D"
direction. It does not exist at all today.

**What it does**: given a tag/record id, returns everything the 3D viewer
needs in one response, so it doesn't have to make a second call:

```jsonc
{
  "modelId": "...",
  "modelFile": "...",
  "modelName": "...",
  "taggingReliability": "...",
  "objectRef": { /* objectId / objectPath / meshName - objectRef contract */ }
}
```

Note: `modelFile`, `taggingReliability`, and `objectRef` are not fields on
the current `Tag` or `Model` schemas (`tags.model.ts`, `model.model.ts` has
`file`/`modelName` but nothing named `modelFile` or `taggingReliability`) -
this endpoint depends on BE-01 to introduce them.

**How we know it's done** (from the ticket):
- [ ] The frontend can load the model, move the camera to the saved
      position, and highlight the machine using only this one response
- [ ] If the model was permanently deleted, return `404` with a clear
      message saying so
- [ ] Respects role and location permissions
- [ ] Written here in `/docs/api.md` before the frontend starts their FE-06
      (tracked by this section itself - keep it current as the ticket lands)

---

Separately, and not resolved by either ticket above: the frontend's
`object-ref-contract.md` acceptance criteria references a
`GET /model/:id/objects` endpoint (a canonical per-model list of machines
with their server-computed `objectId`/`objectPath`, used to verify the
frontend's client-side calculation matches the backend's) - no such route
exists in `model.routes.ts` today, and neither BE-09 nor BE-10 adds it.
