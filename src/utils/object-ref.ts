import crypto from "crypto";

/**
 * Builds the human-readable, hierarchical path to a mesh node, e.g.
 * "Building A/Room 1/Group#189[0]/_primitive0".
 *
 * `siblingIndex` must be supplied whenever more than one sibling under the
 * same parent shares the exact same name (Babylon/GLTF allows this) - it is
 * what tells two otherwise-identical-looking nodes apart. Omit it (or pass 0
 * with a sibling count of 1) when the name is already unique among siblings.
 */
export const buildObjectPath = (
	nodeNames: string[],
	siblingIndex = 0,
	siblingCount = 1
): string => {
	const path = nodeNames.join("/");
	return siblingCount > 1 ? `${path}[${siblingIndex}]` : path;
};

/**
 * Computes the stable objectId for a mesh, per /docs/object-ref-contract.md.
 *
 * The id is derived only from things that do not change between page loads:
 * the mesh's full path in the model, its vertex/point count, and its
 * material name. It must NEVER be derived from Babylon's mesh.uniqueId,
 * which is regenerated on every load.
 *
 * The frontend must implement this exact same algorithm (path + "::" +
 * pointCount + "::" + materialName, sha256, first 16 hex chars) so that both
 * sides calculate the same id for the same machine.
 */
export const computeObjectId = (
	objectPath: string,
	pointCount: number,
	materialName: string
): string => {
	const fingerprint = `${objectPath}::${pointCount}::${materialName || "none"}`;
	return crypto.createHash("sha256").update(fingerprint).digest("hex").slice(0, 16);
};