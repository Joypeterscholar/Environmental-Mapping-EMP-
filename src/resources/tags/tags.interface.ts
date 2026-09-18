import mongoose from "mongoose";

// The objectRef contract - see /docs/object-ref-contract.md.
// objectId is the stable, hashed machine identifier (does not change between
// page loads). objectPath is the human-readable location, e.g.
// "Building A/Room 1/Conveyor 3". meshName is the raw Babylon mesh name kept
// only for debugging. All three are optional for backward compatibility with
// clients that have not adopted the contract yet. Tag position and camera
// state continue to travel inside the existing `taggedInfo` JSON blob.
export default interface Tag extends Document {
    id: mongoose.Types.ObjectId,
    objectName: string,
    objectId: string,
    objectPath: string,
    meshName: string,
    incident: mongoose.Types.ObjectId,
    evidence: string,
    action: string,
    presence: string,
    locations: string,
    sample: mongoose.Types.ObjectId,
    user: mongoose.Types.ObjectId,
    model: mongoose.Types.ObjectId,
    text: string,
    taggedInfo: string,
    type: string,
    slug: string,

}
