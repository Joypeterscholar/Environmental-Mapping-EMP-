# Object Reference Contract

This is the agreed contract for how the frontend and backend identify a
machine. It exists because meshes are currently identified by their raw
Babylon name (e.g. `Group#189`), and the 3D authoring software can give two
different machines the exact same name. When that happens, a tag can end up
attached to the wrong machine, which is the single worst thing EMP can do.

Both repos must keep this file in sync:
- Frontend: `docs/object-ref-contract.md`
- Backend: `docs/object-ref-contract.md` (this file)

## The `objectRef` shape

Every request that tags a specific mesh (add tag, update tag) should send an
`objectRef`-shaped payload alongside the existing fields:

```jsonc
{
  "modelId": "65f1...",              // which facility/model this belongs to
  "objectId": "3f9a1c7b2e4d5a01",    // the stable id - see below
  "objectPath": "Building A/Room 1/Conveyor 3", // human-readable, for display
  "meshName": "Group#189",           // raw Babylon mesh name, kept for debugging only
  "position": { "x": 0, "y": 0, "z": 0 },       // where on the mesh the tag was placed
  "camera": {
    "position": { "x": 0, "y": 0, "z": 0 },
    "direction": { "x": 0, "y": 0, "z": 0 },
    "rotation": { "x": 0, "y": 0, "z": 0 }
  }
}
```

`meshName`/`objectName` alone is never enough to identify a machine and must
not be relied on for anything except display and debugging.

Today, only `objectId`, `objectPath` and `meshName` are sent as their own
fields on a tag (see `src/resources/tags/tags.model.ts`). `position` and
`camera` keep travelling inside the existing `taggedInfo` JSON blob that the
frontend already sends - there was no need to duplicate them as separate
fields to fix the machine-identification problem this contract exists for.

## How `objectId` is calculated

`objectId` must be the same value every time, for the same machine - today,
tomorrow, and after anyone refreshes the page. It is built only from things
that do not change:

1. `objectPath` - the mesh's full path from the root of the model down to the
   mesh itself, joined with `/` (e.g. `Building A/Room 1/Conveyor 3`). If a
   mesh shares its name with a sibling under the same parent, append a
   zero-based index in brackets to disambiguate them, e.g. `Group#189[0]` and
   `Group#189[1]`.
2. `pointCount` - the number of vertices/points in that mesh's own geometry
   (not merged with its children).
3. `materialName` - the name of the material assigned to the mesh, or
   `"none"` if it has none.

```
fingerprint = `${objectPath}::${pointCount}::${materialName}`
objectId    = sha256(fingerprint), first 16 hex characters
```

Both sides implement this exact algorithm so they compute the same
`objectId` independently:
- Backend: [`src/utils/object-ref.ts`](../src/utils/object-ref.ts)
  (`buildObjectPath` + `computeObjectId`), using Node's `crypto` module.
- Frontend (`environmental-mapping-web-frontend` repo): `src/utils/objectRef.js`
  (same functions, same fingerprint string and truncation), using the Web
  Crypto API (`crypto.subtle.digest`) so no extra dependency is needed.

**Do not use Babylon's `mesh.uniqueId`.** It looks like a good id, but
Babylon generates a fresh one on every page load, so it will never match
between sessions or between the frontend and backend.

## Worked examples

### 1. A normal machine (single mesh, unique name)

- `objectPath`: `Building A/Room 1/TROLLEY#1`
- `pointCount`: `2481`
- `materialName`: `TrolleyBodyMat`
- `objectId` = `computeObjectId("Building A/Room 1/TROLLEY#1", 2481, "TrolleyBodyMat")`

### 2. A machine split into primitives (`_primitive0` / `_primitive1`)

Some exporters split one visual machine into multiple mesh primitives, each
with its own geometry. Each primitive is a distinct node and gets its own
`objectId`, because they are genuinely separate meshes:

- `Building A/Room 1/WasteBin[0]/_primitive0` -> its own `objectId`
- `Building A/Room 1/WasteBin[0]/_primitive1` -> its own `objectId`

To tag "the machine" rather than one primitive, the frontend should let the
user pick (or default to) the parent node - `Building A/Room 1/WasteBin[0]` -
and compute its `objectId` from the parent's own path/point count/material.
`meshName` for a primitive tag stays as the primitive's raw name
(`WasteBin_primitive0`) so it can still be traced back during debugging.

### 3. A repeated machine (an instance)

Two conveyors that are visually identical and both named `Group#189` in the
model are told apart purely by `objectPath`, using the sibling index:

- `Building A/Room 1/Group#189[0]` -> `objectId` A
- `Building A/Room 1/Group#189[1]` -> `objectId` B

Because the path (which includes the sibling index), point count, and
material are identical for true instances, their `objectId`s will only
differ if their `objectPath` differs - which is why the sibling index must
always be included when a name repeats among siblings.

### When two machines genuinely cannot be told apart

If two nodes have the same parent, the same name, the same point count, and
the same material - and there is no other structural difference - they are
indistinguishable by this scheme. In that case the model itself is
ambiguous: the fix is at the source (rename or otherwise structurally
differentiate the nodes in the 3D model), not in the hashing algorithm. The
frontend should surface this as a data-quality warning rather than silently
guessing.

## How we know this is done

- This file is merged into both the frontend and backend repos and the two
  copies match.
- It has a worked example for a normal machine, a `_primitive` machine, and
  an instanced machine (above).
- It states what to do when two machines genuinely cannot be told apart
  (above).
- A throwaway test proves the same id comes back twice for the same input:
  - Backend: [`src/tests/object-ref.test.ts`](../src/tests/object-ref.test.ts)
    (`npm test`).
  - Frontend: `scripts/verify-object-id.mjs` in the frontend repo
    (`node scripts/verify-object-id.mjs`).