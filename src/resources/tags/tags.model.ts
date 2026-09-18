import mongoose, { Schema, model } from "mongoose";

import Tag from "./tags.interface";
const TagsSchema = new Schema(
	{
		objectName: {
			type: String,
			require: true,
		},
		// objectRef contract fields - see /docs/object-ref-contract.md.
		// Optional so existing clients that only send objectName keep working.
		objectId: {
			type: String,
			required: false,
			index: true,
		},
		objectPath: {
			type: String,
			required: false,
		},
		meshName: {
			type: String,
			required: false,
		},
		incident: {
			type: String,
			required: false,
		},
		evidence: { type: String, require: false },
		action: { type: String },
		locations: { type: String, required: [false, "Please provide location"] },
		presence: {
			type: String,
			enum: ["positive", "negative"],
			required: false,
		},
		sample: {
			type: String,
			required: false,
		},
		user: {
			type: Schema.Types.ObjectId,
			ref: "User",
			required: true,
		},
		model: {
			type: Schema.Types.ObjectId,
			ref: "Model",
			required: true,
		},
		text: {
			type: String,
			required: false,
		},
		taggedInfo: {
			type: String,
			required: false,
		},
		type: {
			type: String,
			enum: ["incident", "sampling"],
			required: false,
		},
		group: {
			type: String,
			required: false,
		},
		zone: {
			type: String,
			required: false,
			default: "",
		},
		sampleDetails: {
			type: String,
			required: false,
			default: "",
		},
		slug: {
			type: String,
			required: false,
		},
	},
	{ timestamps: true }
);

export default model<Tag>("Tag", TagsSchema);
