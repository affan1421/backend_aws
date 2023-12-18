const mongoose = require('mongoose');
const Feetype = require('../models/feeType');
const ErrorResponse = require('../utils/errorResponse');
const catchAsync = require('../utils/catchAsync');
const SuccessResponse = require('../utils/successResponse');

// CREATE
exports.create = async (req, res, next) => {
	const {
		feeType,
		accountType,
		schoolId,
		description,
		categoryId,
		isMisc = false,
	} = req.body;
	if (!feeType || !accountType || !schoolId) {
		return next(new ErrorResponse('All Fields are Mandatory', 422));
	}

	const isExist = await Feetype.findOne({ feeType, schoolId, categoryId });
	if (isExist) {
		return next(new ErrorResponse('Fee Type Already Exist', 400));
	}

	const payload = {
		feeType,
		accountType,
		schoolId,
		description,
		isMisc,
	};

	if (categoryId != null) {
		payload.categoryId = categoryId;
	}
	if (isMisc) payload.feeCategory = 'MISCELLANEOUS';

	let newFeeType;
	try {
		newFeeType = await Feetype.create(payload);
	} catch (error) {
		console.log('error', error);
		return next(new ErrorResponse('Something Went Wrong', 500));
	}
	return res
		.status(201)
		.json(SuccessResponse(newFeeType, 1, 'Created Successfully'));
};

// GET
exports.getTypes = catchAsync(async (req, res, next) => {
	let { schoolId, accountType, categoryId, page, limit, isMisc } = req.query;
	const payload = {};
	if (schoolId) {
		payload.schoolId = mongoose.Types.ObjectId(schoolId);
	}
	if (categoryId) {
		payload.categoryId = mongoose.Types.ObjectId(categoryId);
	}
	if (accountType) {
		payload.accountType = accountType;
	}
	if (isMisc) {
		payload.isMisc = true;
	}
	// Optional Pagination
	const dataFacet = [{ $match: payload }];
	if (page && limit) {
		page = +page;
		limit = +limit;
		dataFacet.push({ $skip: page * limit }, { $limit: limit });
	}
	const [{ data, count }] = await Feetype.aggregate([
		{
			$facet: {
				data: dataFacet,
				count: [{ $match: payload }, { $count: 'count' }],
			},
		},
	]);

	if (count.length === 0) {
		return next(new ErrorResponse('No Fee Type Found', 404));
	}
	res
		.status(200)
		.json(SuccessResponse(data, count[0].count, 'Fetched Successfully'));
});

// READ
exports.read = catchAsync(async (req, res, next) => {
	const { id } = req.params;

	const feetype = await Feetype.findOne({
		_id: id,
	});
	if (feetype === null) {
		return next(new ErrorResponse('Fee Type Not Found', 404));
	}
	res.status(200).json(SuccessResponse(feetype, 1, 'Fetched Successfully'));
});

// UPDATE
exports.update = catchAsync(async (req, res, next) => {
	const { id } = req.params;
	const {
		feeType,
		description,
		accountType,
		schoolId,
		academicYearId,
		categoryId,
	} = req.body;
	const feetype = await Feetype.findOneAndUpdate(
		{ _id: id },
		{
			feeType,
			description,
			academicYearId,
			categoryId,
			accountType,
			schoolId,
		}
	);
	if (feetype === null) {
		return next(new ErrorResponse('Fee Type Not Found', 404));
	}
	res.status(200).json(SuccessResponse(feetype, 1, 'Updated Successfully'));
});

// DELETE
exports.feeDelete = catchAsync(async (req, res, next) => {
	const { id } = req.params;

	const feetype = await Feetype.findOneAndDelete({
		_id: id,
	});
	if (feetype === null) {
		return next(new ErrorResponse('Fee Type Not Found', 404));
	}
	res.status(200).json(SuccessResponse(null, 1, 'Deleted Successfully'));
});
