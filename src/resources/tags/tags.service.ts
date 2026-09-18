import moment from "moment";
import { saveToDisk, UploadEvidenceToS3 } from "../../utils/aws/aws";
import modelModel from "../models/model.model";
import userModel from "../users/user.model";
import tagsModel from "./tags.model";
import { Types } from "mongoose";
import { RoleType } from "../users/user.Interface";
import { toObjectId, toObjectIdArray } from "../../utils/mongo";
export const addTags = async (
	incident: string,
	objectName: string,
	fileName: any,
	action: string,
	locations: string,
	sample: string,
	userId: string,
	modelId: string,
	evidenceFile: any,
	taggedInfo: string,
	text: string,
	presence: string,
	type: string,
	group: string,
	rest: any,
	objectRef?: {
		objectId?: string;
		objectPath?: string;
		meshName?: string;
	}
): Promise<any> => {
	try {
		const Model = await modelModel.findById(modelId);
		const User = await userModel.findById(userId);
		let evidenceKey;
		let evidenceUrl;

		let tagData;
		let Tag;

		// Generate a unique 4-digit slug
		let slug = "";
		if (type === "sampling") {
			const timestamp = Math.floor(Date.now() / 1000);
			slug = `SAM-${timestamp}`;
		}
		if (type === "incident") {
			const timestamp = Math.floor(Date.now() / 1000);
			slug = `INC-${timestamp}`;
		}

		if (!User || !Model) throw new Error("Invalid User or Model");

		if (fileName && evidenceFile) {
			evidenceKey = `evidence/${Model.modelName}/${fileName}`;
			evidenceUrl = await (async () => {
				if (process.env.NODE_ENV === "development") {
					let evidenceUrl = await saveToDisk(evidenceFile, evidenceKey);
					return evidenceUrl;
				}
				return UploadEvidenceToS3(evidenceFile, evidenceKey);
			})();
		}

		// objectRef contract fields (see /docs/object-ref-contract.md) - applied
		// to both tag types so the machine identity is never dropped depending
		// on whether the tag is an incident or a sampling record.
		const objectRefFields = {
			objectId: objectRef?.objectId,
			objectPath: objectRef?.objectPath,
			meshName: objectRef?.meshName,
		};

		if (type === "sampling") {
			tagData = {
				objectName,
				...objectRefFields,
				evidence: evidenceUrl,
				action,
				sample,
				locations,
				user: User,
				model: Model,
				taggedInfo,
				text,
				presence: presence || "negative",
				type,
				slug,
				group,
				...rest,
			};
		}
		if (type === "incident") {
			tagData = {
				incident,
				objectName,
				...objectRefFields,
				evidence: evidenceUrl,
				action,
				locations,
				user: User,
				model: Model,
				taggedInfo,
				text,
				type,
				slug,
				group,
				...rest,
			};
		}

		Tag = await tagsModel.create(tagData);

		Model?.tags.push((await Tag)._id);

		await Model?.save();
		return Tag;
	} catch (error: any) {
		return { error: error.message };
	}
};

export const taggedSamplesByday = async (): Promise<any> => {
	try {
		// Use MongoDB aggregation to get the amount of samples tagged on each day of the week
		const result = await tagsModel.aggregate([
			{
				$lookup: {
					from: "samples", // Name of the sample collection
					localField: "sample",
					foreignField: "_id",
					as: "sample",
				},
			},
			{
				$unwind: "$sample", // Flatten the sample array
			},
			{
				$project: {
					dayOfWeek: { $dayOfWeek: { $toDate: "$createdAt" } }, // Extract day of the week from createdAt field
					sampleId: "$sample._id", // Get the sample ID
				},
			},
			{
				$group: {
					_id: "$dayOfWeek", // Group by day of the week
					samplesTagged: { $addToSet: "$sampleId" }, // Add sample IDs to set to count unique samples
				},
			},
			{
				$project: {
					_id: 0, // Exclude _id from the result
					dayOfWeek: "$_id", // Rename _id to dayOfWeek
					samplesTagged: { $size: "$samplesTagged" }, // Get the count of unique samples
				},
			},
			{
				$sort: { dayOfWeek: 1 }, // Sort by day of the week in ascending order
			},
		]);

		return result;
	} catch (error: any) {
		return { error: error.message };
	}
};

export const getTotalTagsBySampleAndMonth = async (
	userId: string
): Promise<any> => {
	try {
		// Fetch the user
		const user = await userModel.findById(userId).exec();

		if (!user) {
			throw new Error("User not found");
		}

		let tagsBySampleAndMonth;

		if (user.role === RoleType.superAdmin) {
			// No location restriction for super admin
			tagsBySampleAndMonth = await tagsModel.aggregate([
				{
					$group: {
						_id: {
							sample: "$sample",
							month: { $month: "$createdAt" }, // Extract month
						},
						totalTags: { $sum: 1 },
					},
				},
				{
					$project: {
						_id: 0,
						sample: "$_id.sample",
						month: "$_id.month",
						totalTags: 1,
					},
				},
				{
					$sort: { sample: 1, month: 1 },
				},
			]);
		} else {
			// Restrict by user's locations
			const locationId = toObjectId(user?.locations);
			if (!locationId) {
				return {};
			}
			tagsBySampleAndMonth = await tagsModel.aggregate([
				{
					$match: {
						locations: locationId,
					},
				},
				{
					$group: {
						_id: {
							sample: "$sample",
							month: { $month: "$createdAt" },
						},
						totalTags: { $sum: 1 },
					},
				},
				{
					$project: {
						_id: 0,
						sample: "$_id.sample",
						month: "$_id.month",
						totalTags: 1,
					},
				},
				{
					$sort: { sample: 1, month: 1 },
				},
			]);
		}

		// Group by sample name in JS
		const result = tagsBySampleAndMonth.reduce(
			(acc, { sample, totalTags, month }) => {
				if (!sample) sample = "Unknown";
				if (!acc[sample]) {
					acc[sample] = [];
				}
				acc[sample].push({ totalTags, month });
				return acc;
			},
			{}
		);

		return result;
	} catch (error: any) {
		return { error: error.message };
	}
};

export const getTotalTagsBySampleAndDay = async (
	userId: string
): Promise<any> => {
	try {
		// Calculate the start of the current week
		const startOfWeek = moment().startOf("day").subtract(7, "days");
		const user = await userModel.findById(userId).exec();

		if (!user) {
			throw new Error("User not found");
		}

		let tagsBySampleAndDayOfWeek;

		// If the user is a super admin, execute the aggregation query without location restriction
		if (user.role === RoleType.superAdmin) {
			// Calculate the start of the current week
			const startOfWeek = moment().startOf("day").subtract(7, "days");

			tagsBySampleAndDayOfWeek = await tagsModel.aggregate([
				{
					$match: {
						createdAt: {
							$gte: startOfWeek.toDate(), // Only from start of the current week
						},
					},
				},
				{
					$group: {
						_id: {
							sample: "$sample", // group by sample field in Tag
							dayOfWeek: { $dayOfWeek: "$createdAt" }, // extract day of the week
						},
						totalTags: { $sum: 1 }, // count
					},
				},
				{
					$project: {
						_id: 0,
						sample: "$_id.sample", // expose sample value
						dayOfWeek: "$_id.dayOfWeek", // expose day of week
						totalTags: 1, // expose total count
					},
				},
			]);
		} else {
			const locationId = toObjectId(user?.locations);
			if (!locationId) {
				return {};
			}
			tagsBySampleAndDayOfWeek = await tagsModel.aggregate([
				{
					$match: {
						locations: locationId, // filter by location(s)
						createdAt: {
							$gte: startOfWeek.toDate(),
						},
					},
				},
				{
					$group: {
						_id: {
							sample: "$sample",
							dayOfWeek: { $dayOfWeek: "$createdAt" },
						},
						totalTags: { $sum: 1 },
					},
				},
				{
					$project: {
						_id: 0,
						sample: "$_id.sample",
						dayOfWeek: "$_id.dayOfWeek",
						totalTags: 1,
					},
				},
			]);
		}

		// Group the results by sample name
		const result = tagsBySampleAndDayOfWeek?.reduce(
			(acc, { totalTags, dayOfWeek, ...rest }) => {
				const name = rest.sample || "Unknown";
				if (!acc[name]) {
					acc[name] = [];
				}
				acc[name].push({ totalTags, dayOfWeek });
				return acc;
			},
			{}
		);

		return result;
	} catch (error: any) {
		return { error: error.message };
	}
};

export const taggedIncidentByMonth = async (userId: string): Promise<any> => {
	try {
		const user = await userModel.findById(userId).exec();

		if (!user) {
			throw new Error("User not found");
		}

		let result;

		if (user.role === RoleType.superAdmin) {
			// No location restriction
			result = await tagsModel.aggregate([
				{
					$project: {
						month: { $month: "$createdAt" },
						incident: "$incident", // direct from Tag schema
					},
				},
				{
					$group: {
						_id: { incident: "$incident", month: "$month" },
						totalTags: { $sum: 1 },
					},
				},
				{
					$group: {
						_id: "$_id.incident",
						tagsByMonth: {
							$push: {
								totalTags: "$totalTags",
								month: "$_id.month",
							},
						},
					},
				},
				{
					$project: {
						_id: 0,
						incident: "$_id",
						tagsByMonth: 1,
					},
				},
			]);
		} else {
			// Restrict by user's allowed locations
			const allowedLocations = toObjectIdArray(user?.locations);
			if (!allowedLocations.length) {
				return {};
			}

			result = await tagsModel.aggregate([
				{
					$match: {
						locations: { $in: allowedLocations },
					},
				},
				{
					$project: {
						month: { $month: "$createdAt" },
						incident: "$incident",
					},
				},
				{
					$group: {
						_id: { incident: "$incident", month: "$month" },
						totalTags: { $sum: 1 },
					},
				},
				{
					$group: {
						_id: "$_id.incident",
						tagsByMonth: {
							$push: {
								totalTags: "$totalTags",
								month: "$_id.month",
							},
						},
					},
				},
				{
					$project: {
						_id: 0,
						incident: "$_id",
						tagsByMonth: 1,
					},
				},
			]);
		}

		// Convert aggregation output to an object keyed by incident
		const formattedResult: any = {};
		result.forEach((item: any) => {
			formattedResult[item.incident || "Unknown"] = item.tagsByMonth;
		});

		return formattedResult;
	} catch (error: any) {
		return { error: error.message };
	}
};

export const taggedIncidentByDay = async (userId: string): Promise<any> => {
	try {
		const user = await userModel.findById(userId).exec();

		if (!user) {
			throw new Error("User not found");
		}

		let result;

		if (user.role === RoleType.superAdmin) {
			// No location restriction
			result = await tagsModel.aggregate([
				{
					$project: {
						dayOfWeek: { $dayOfWeek: "$createdAt" }, // 1 = Sunday, 7 = Saturday
						incident: "$incident",
					},
				},
				{
					$group: {
						_id: { incident: "$incident", dayOfWeek: "$dayOfWeek" },
						totalTags: { $sum: 1 },
					},
				},
				{
					$group: {
						_id: "$_id.incident",
						tagsByDayOfWeek: {
							$push: {
								totalTags: "$totalTags",
								dayOfWeek: "$_id.dayOfWeek",
							},
						},
					},
				},
				{
					$project: {
						_id: 0,
						incident: "$_id",
						tagsByDayOfWeek: 1,
					},
				},
			]);
		} else {
			// Restrict by user's allowed locations
			const allowedLocations = toObjectIdArray(user?.locations);
			if (!allowedLocations.length) {
				return {};
			}

			result = await tagsModel.aggregate([
				{
					$match: {
						locations: { $in: allowedLocations },
					},
				},
				{
					$project: {
						dayOfWeek: { $dayOfWeek: "$createdAt" },
						incident: "$incident",
					},
				},
				{
					$group: {
						_id: { incident: "$incident", dayOfWeek: "$dayOfWeek" },
						totalTags: { $sum: 1 },
					},
				},
				{
					$group: {
						_id: "$_id.incident",
						tagsByDayOfWeek: {
							$push: {
								totalTags: "$totalTags",
								dayOfWeek: "$_id.dayOfWeek",
							},
						},
					},
				},
				{
					$project: {
						_id: 0,
						incident: "$_id",
						tagsByDayOfWeek: 1,
					},
				},
			]);
		}

		// Convert aggregation output into object keyed by incident
		const formattedResult: any = {};
		result.forEach((item: any) => {
			formattedResult[item.incident || "Unknown"] = item.tagsByDayOfWeek;
		});

		return formattedResult;
	} catch (error: any) {
		return { error: error.message };
	}
};

export const deleteModelTags = async (id: string): Promise<any> => {
	try {
		// Find the model by its ID
		const model = await modelModel.findById(id);

		if (!model) {
			return;
		}

		// Set the tags array to an empty array
		model.tags = [new Types.ObjectId()];

		// Save the updated model
		await model.save();

		// Delete the tags from the database
		await tagsModel.deleteMany({ model: model._id });
		// Save the updated model
		await model.save();
	} catch (error: any) {
		return { error: error.message };
	}
};
