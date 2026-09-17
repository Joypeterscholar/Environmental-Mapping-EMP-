# EMP

## Read this first: what EMP is supposed to do

EMP is a 3D copy of a factory. A user clicks on a machine in the 3D model and attaches a test result to it. Later, someone else searches for that test result and can jump back to the exact machine.

There are five things that must work perfectly:

1. When you click a machine, EMP knows which machine it is.
2. A test attached to Machine A stays on Machine A, forever.
3. You can go machine → test record, and test record → machine.
4. Search finds the right records, even when there are thousands.
5. A broken 3D file shows a clear message, not a crash.

Everything in this list of tasks exists to make one of those five things work.

## Words you will see in these tasks

| Word | What it means |
| --- | --- |
| Mesh | One 3D shape inside a model file. A conveyor belt is a mesh. |
| Tag | A record we attach to a spot on a machine. In our code, "tag" and "record" mean the same thing. |
| Schema | The shape of our data in MongoDB. It lives in the `*.model.ts` files. |
| Index | Like the index at the back of a textbook. Without it, MongoDB reads every single record to find one. With it, MongoDB jumps straight to the answer. |
| Collection scan | MongoDB reading every record in the database to answer one question. Very slow. This is what we are trying to stop. |
| Populate | Mongoose fetching linked data (like the user who made a tag). Each `populate` is an extra database trip. Too many makes things slow. |
| Aggregation | MongoDB doing the work itself (counting, joining, grouping) instead of sending everything to Node.js to do it. Much faster. |
| Regex | A text-matching pattern. Some regex patterns can use an index; some cannot. Ours currently cannot. |
| Migration | A one-time script that updates data that is already in the database. |
| Soft delete | Marking something as deleted instead of actually removing it, so it can be restored. |
| p95 | "95% of requests are faster than this." A normal way to measure speed. |
| `.explain()` | A MongoDB command that tells you how it answered your question — whether it used an index or read everything. |

## How to check any speed task

Several tasks ask for `.explain()` output. Here is how:

```ts
const result = await tagsModel.find({ /* your query */ }).explain("executionStats");
console.log(JSON.stringify(result, null, 2));
```

Look at two things in the output:

- `stage` — you want `IXSCAN` (used an index). You do not want `COLLSCAN` (read everything).
- `totalDocsExamined` vs `nReturned` — if you returned 10 records but examined 10,000, the index is not being used properly.

Paste that output into your pull request.
