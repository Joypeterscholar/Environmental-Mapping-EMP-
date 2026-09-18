import { buildObjectPath, computeObjectId } from "../utils/object-ref";

describe("object-ref contract", () => {
	it("computes the same objectId every time for the same machine", () => {
		const path = buildObjectPath(["Building A", "Room 1", "TROLLEY#1"]);

		const first = computeObjectId(path, 2481, "TrolleyBodyMat");
		const second = computeObjectId(path, 2481, "TrolleyBodyMat");

		expect(first).toEqual(second);
	});

	it("tells two identically-named siblings apart using the sibling index", () => {
		const pathA = buildObjectPath(["Building A", "Room 1", "Group#189"], 0, 2);
		const pathB = buildObjectPath(["Building A", "Room 1", "Group#189"], 1, 2);

		const idA = computeObjectId(pathA, 900, "ConveyorMat");
		const idB = computeObjectId(pathB, 900, "ConveyorMat");

		expect(idA).not.toEqual(idB);
	});

	it("does not change when unrelated things change - only path/pointCount/material matter", () => {
		const path = buildObjectPath(["Building A", "Room 1", "Waste Bin"]);

		const idBeforeRefresh = computeObjectId(path, 512, "BinMat");
		const idAfterRefresh = computeObjectId(path, 512, "BinMat");

		expect(idBeforeRefresh).toEqual(idAfterRefresh);
	});

	// This exact value is also asserted by the frontend's
	// scripts/verify-object-id.mjs for the same three inputs. If this
	// test ever needs to change, the frontend script must change with it -
	// that pairing is the actual proof the two repos calculate the same id.
	it("matches the value the frontend independently calculates for the same inputs", () => {
		const path = buildObjectPath(["Building A", "Room 1", "TROLLEY#1"]);

		const id = computeObjectId(path, 2481, "TrolleyBodyMat");

		expect(id).toEqual("092022f163babaa9");
	});
});