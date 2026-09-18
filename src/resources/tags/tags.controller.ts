import { Response, NextFunction } from "express";
import { TagsServices } from ".";
import { HttpException } from "../../utils/exceptions/http.exceptions";
import tagModel from "./tags.model";
import modelModel from "../models/model.model";
import { RoleType } from "../users/user.Interface";
import { AuthUserRequest } from "../../middlewares/auth.middleware";
import userModel from "../users/user.model";
// import tagsModel from "./tags.model";
import { toObjectId, toObjectIdArray } from "../../utils/mongo";

export class TagController {
	async addTag(req: AuthUserRequest, res: Response, next: NextFunction) {

		const {
			incident,
			action,
			locations,
			sample,
			userId,
			modelId,
			taggedInfo,
			objectName,
			text,
			presence,
			type,
			group,
			// objectRef contract fields - see /docs/object-ref-contract.md.
			objectId,
			objectPath,
			meshName,
			...rest
		} = req.body;

		if (!userId) {
			res.status(400).send("please login into the app");
		}
		try {
			const files = req.files;
			let imageFile: Express.Multer.File | null = null;
			let fileName;
			let evidenceFile;
			if (
				typeof files === "object" &&
				files !== null &&
				"evidence" in files &&
				Array.isArray(files["evidence"])
			) {
				imageFile = files["evidence"][0];
				evidenceFile = imageFile?.buffer;
				fileName = imageFile?.originalname;
			}

			const data = await TagsServices.addTags(
				incident,
				objectName,
				fileName,
				action,
				locations,
				sample,
				userId,
				modelId,
				evidenceFile,
				taggedInfo,
				text,
				presence,
				type,
				group,
				rest,
				{ objectId, objectPath, meshName }
			);
			res.status(200).json({
				status: "success",
				data,
				message: "tag added successfully",
			});
		} catch (error: any) {
			next(new HttpException(400, error.message));
		}
	}

	async updateTag(req: AuthUserRequest, res: Response, next: NextFunction) {
		try {
			const id = req.params.id;
			const {
				incident,
				frequency,
				locations,
				sample,
				userId,
				modelId,
				taggedInfo,
				objectName,
				text,
				presence,
				type,
				action,
				objectId,
				objectPath,
				meshName,
			} = req.body;
			const files = req.files;
			let imageFile: Express.Multer.File | null = null;
			let fileName;
			let evidenceFile;
			if (
				typeof files === "object" &&
				files !== null &&
				"evidence" in files &&
				Array.isArray(files["evidence"])
			) {
				imageFile = files["evidence"][0];
				evidenceFile = imageFile?.buffer;
				fileName = imageFile?.originalname;
			}

			const tag = await tagModel.findByIdAndUpdate(id, {
				incident,
				objectName,
				objectId,
				objectPath,
				meshName,
				fileName,
				frequency,
				locations,
				sample,
				userId,
				modelId,
				evidenceFile,
				taggedInfo,
				text,
				presence,
				type,
				action,
			});

			res.status(200).json({
				message: "tag updated successfully",
				data: tag,
			});
		} catch (error: any) {
			return { error: error.message };
		}
	}

	async deleteTag(req: AuthUserRequest, res: Response, next: NextFunction) {
		try {
			await tagModel.findByIdAndDelete(req.params.id);
			res.status(200).json({
				message: "tag deleted successfully",
			});
		} catch (error: any) {
			return { error: error.message };
		}
	}
	async getTotalTagsBySampleAndDay(
		req: AuthUserRequest,
		res: Response,
		next: NextFunction
	) {
	}
	async deleteModelTags(
		req: AuthUserRequest,
		res: Response,
		next: NextFunction
	) {
		try {
			const id = req.params.id;

			const data = await TagsServices.deleteModelTags(id);
			res.status(200).json({
				message: "successfully",
				data,
			});
		} catch (error: any) {
			return { error: error.message };
		}
	}

	async paginatedTags(req: AuthUserRequest, res: Response, next: NextFunction) {
		try {
			const userId = req.user?.userId;
			const user = await userModel.findById(userId).exec();
			const page = parseInt((req.query.page as string) || "1", 10) || 1;
			const limit = parseInt((req.query.limit as string) || "25", 10) || 25;
			const search = (req.query.search as string) || "";
			const startDate = req.query.startDate as string;
			const endDate = req.query.endDate as string;
			const skip = (page - 1) * limit;


			const dateFilter: any = {};
			if (startDate && endDate) {
				const start = new Date(startDate);
				start.setHours(0, 0, 0, 0);
				const end = new Date(endDate);
				end.setHours(23, 59, 59, 999);
				dateFilter.createdAt = {
					$gte: start,
					$lte: end,
				};
			}

			if (!user) {
				return res.status(400).send({ error: "User not found" });
			}

			// Build search query for direct tag fields
			const searchQuery: any = {};
			let userIdsForSearch: any[] | null = null;
			if (search && search.trim()) {
				const searchRegex = new RegExp(search.trim(), "i");
				searchQuery.$or = [
					{ objectName: searchRegex },
					{ incident: searchRegex },
					{ presence: searchRegex },
					{ sample: searchRegex },
					{ locations: searchRegex },
					{ text: searchRegex },
					{ type: searchRegex },
					{ group: searchRegex },
					{ slug: searchRegex },
				];

				// Search by user fullname
				const matchingUsers = await userModel
					.find({ fullname: searchRegex })
					.select("_id")
					.lean();
				userIdsForSearch = matchingUsers.map((u) => u._id);
				if (userIdsForSearch.length > 0) {
					searchQuery.$or.push({ user: { $in: userIdsForSearch } });
				}
			}

			// Check if user is a super admin
			if (user.role === RoleType.superAdmin) {

				let modelIdsForSearch: any[] | null = null;
				if (search && search.trim()) {
					const modelSearchRegex = new RegExp(search.trim(), "i");
					const matchingModels = await modelModel
						.find({ modelName: modelSearchRegex })
						.select("_id")
						.lean();
					modelIdsForSearch = matchingModels.map((m) => m._id);
					if (modelIdsForSearch.length > 0) {
						searchQuery.$or = searchQuery.$or || [];
						searchQuery.$or.push({ model: { $in: modelIdsForSearch } });
					}

				}


				const safeModelIds = (await modelModel.find({ delete: { $ne: true } }).select('_id').lean()).map(m => m._id);

				let effectiveModelFilter: any = { $in: safeModelIds };

				if (modelIdsForSearch && modelIdsForSearch.length > 0) {
				}

				const queryWithSafeModels = {
					...(Object.keys(searchQuery).length > 0 ? searchQuery : {}),
					...dateFilter,
					model: { $in: safeModelIds }
				};

				const [tags, total] = await Promise.all([
					tagModel.find(queryWithSafeModels)
						.populate({ path: "user" })
						.populate({ path: "sample" })
						.populate({
							path: "model",
							populate: [{ path: "location" }, { path: "comments" }],
						})
						.sort({ createdAt: -1 })
						.skip(skip)
						.limit(limit),
					tagModel.countDocuments(queryWithSafeModels),
				]);

				return res.status(200).json({
					message: "Paginated tags",
					data: {
						items: tags,
						total,
						page,
						limit,
					},
					status: "success",
				});
			}

			// Non-super admin: filter by allowed locations
			const allowedLocationIds = toObjectIdArray(user?.locations);
			if (!allowedLocationIds.length) {
				return res.status(200).json({
					message: "Filtered tags based on user's allowed locations",
					data: {
						items: [],
						total: 0,
						page,
						limit,
					},
					status: "success",
				});
			}

			const allowedModels = await modelModel
				.find({ location: { $in: allowedLocationIds } })
				.select("_id")
				.lean();
			const allowedModelIds = allowedModels.map((model) => model._id);

			if (!allowedModelIds.length) {
				return res.status(200).json({
					message: "No models found for user's allowed locations",
					data: {
						items: [],
						total: 0,
						page,
						limit,
					},
					status: "success",
				});
			}


			const nonDeletedAllowedModels = await modelModel.find({
				_id: { $in: allowedModelIds },
				delete: { $ne: true }
			}).select('_id').lean();

			const safeAllowedModelIds = nonDeletedAllowedModels.map(m => m._id);


			const finalQuery: any = {
				model: { $in: safeAllowedModelIds },
				...dateFilter,
			};


			let modelIdsForSearch: any[] | null = null;
			if (search && search.trim()) {
				const modelSearchRegex = new RegExp(search.trim(), "i");
				const matchingModels = await modelModel
					.find({
						_id: { $in: safeAllowedModelIds },
						modelName: modelSearchRegex,
					})
					.select("_id")
					.lean();
				modelIdsForSearch = matchingModels.map((m) => m._id);


				if (searchQuery.$or && searchQuery.$or.length > 0) {
					finalQuery.$and = [
						{ model: { $in: safeAllowedModelIds } },
						{ $or: searchQuery.$or },
					];

					if (modelIdsForSearch.length > 0) {
						finalQuery.$and[1].$or.push({
							model: { $in: modelIdsForSearch },
						});
					}
				} else if (modelIdsForSearch.length > 0) {

					finalQuery.model = { $in: modelIdsForSearch };
				}
			}

			const baseQuery = tagModel
				.find(finalQuery)
				.populate({ path: "user", select: "locations email username" })
				.populate({ path: "sample" })
				.populate({
					path: "model",
					populate: [{ path: "location" }, { path: "comments" }],
				})
				.sort({ createdAt: -1 });

			const [tags, total] = await Promise.all([
				baseQuery.clone().skip(skip).limit(limit),
				tagModel.countDocuments(finalQuery),
			]);

			return res.status(200).json({
				message: "Filtered tags based on user's allowed locations",
				data: {
					items: tags,
					total,
					page,
					limit,
				},
				status: "success",
			});
		} catch (error: any) {
			next(new HttpException(400, error.message));
		}
	}
	async allTags(req: AuthUserRequest, res: Response, next: NextFunction) {
		try {
			const userId = req.user?.userId;
			const user = await userModel.findById(userId).exec();

			if (!user) {
				return res.status(400).send({ error: "User not found" });
			}

			// Check if user is not found or if user is not a super admin
			if (user.role === RoleType.superAdmin) {

				const tags = await tagModel
					.find()
					.populate({ path: "user" })
					.populate({ path: "sample" })
					.populate({
						path: "model",
						populate: [{ path: "location" }, { path: "comments" }],
					})
					.sort({ createdAt: -1 });
				res.status(200).json({
					message: "All tags",
					data: tags,
					status: "success",
				});
			} else {
				const allowedLocationIds = toObjectIdArray(user?.locations);
				if (!allowedLocationIds.length) {
					return res.status(200).json({
						message: "Filtered tags based on user's allowed locations",
						data: [],
						status: "success",
					});
				}

				const allowedModels = await modelModel
					.find({ location: { $in: allowedLocationIds } })
					.select("_id")
					.lean();
				const allowedModelIds = allowedModels.map((model) => model._id);

				if (!allowedModelIds.length) {
					return res.status(200).json({
						message: "No models found for user's allowed locations",
						data: [],
						status: "success",
					});
				}

				const tags = await tagModel
					.find({ model: { $in: allowedModelIds } })
					.populate({ path: "user", select: "locations email username" })
					.populate({ path: "sample" })
					.populate({
						path: "model",
						populate: [{ path: "location" }, { path: "comments" }],
					})
					.sort({ createdAt: -1 });

				res.status(200).json({
					message: "Filtered tags based on user's allowed locations",
					data: tags,
					status: "success",
				});
			}
		} catch (error: any) {
			next(new HttpException(400, error.message));
		}
	}
}
