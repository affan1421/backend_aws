const mongoose = require('mongoose');
const FeeSchedule = require('../models/feeSchedule');
const catchAsync = require('../utils/catchAsync');
const ErrorResponse = require('../utils/errorResponse');
const SuccessResponse = require('../utils/successResponse');

function getScheduleDates(months, day, existMonths) {
	const currentYear = new Date().getFullYear();
	const nextYear = currentYear + 1;

	const scheduledDates = [];

	// Loop through each month and create a date string
	for (const month of months) {
		const year = month > existMonths[0] ? currentYear : nextYear;
		const dateString = new Date(year, month - 1, day);
		scheduledDates.push(dateString);
	}

	return scheduledDates;
}

// @desc    Create a new fee schedule
// @route   POST /api/v1/feeSchedule
// @access  Private
exports.create = async (req, res, next) => {
	let feeSchedule = null;
	const {
		scheduleName,
		description = '',
		schoolId,
		day,
		months,
		existMonths,
		categoryId,
	} = req.body;
	if (
		!scheduleName ||
		!day ||
		!months ||
		!existMonths ||
		!schoolId ||
		!categoryId
	) {
		return next(new ErrorResponse('Please Provide All Required Fields', 422));
	}

	const scheduledDates = getScheduleDates(months, day, existMonths);

	const isExists = await FeeSchedule.findOne({
		scheduleName,
		schoolId,
		categoryId,
	});
	if (isExists) {
		return next(new ErrorResponse('Fee Schedule Already Exists', 400));
	}
	try {
		feeSchedule = await FeeSchedule.create({
			scheduleName,
			description,
			schoolId,
			scheduledDates,
			categoryId,
			day,
			months,
		});
	} catch (error) {
		return next(new ErrorResponse('Something Went Wrong', 500));
	}
	res.status(201).json(SuccessResponse(feeSchedule, 1, 'Created Successfully'));
};

// @desc    Get all fee schedules
// @route   GET /api/v1/feeSchedule
// @access  Private
exports.getAll = catchAsync(async (req, res, next) => {
	let { schoolId, scheduleType, categoryId, page = 0, limit = 5 } = req.query;
	page = +page;
	limit = +limit;
	const payload = {};
	if (schoolId) {
		payload.schoolId = mongoose.Types.ObjectId(schoolId);
	}
	if (categoryId) {
		payload.categoryId = mongoose.Types.ObjectId(categoryId);
	}
	if (scheduleType) {
		payload.scheduleType = scheduleType;
	}

	const aggregate = [
		{ $match: payload },
		{
			$facet: {
				data: [{ $skip: page * limit }, { $limit: limit }],
				docCount: [{ $count: 'count' }],
			},
		},
	];
	const [{ data, docCount }] = await FeeSchedule.aggregate(aggregate);

	if (docCount.length === 0) {
		return next(new ErrorResponse('Fee Schedules Not Found', 404));
	}
	res
		.status(200)
		.json(SuccessResponse(data, docCount[0].count, 'Fetched Successfully'));
});

// @desc    Get a fee schedule
// @route   GET /api/v1/feeSchedule/:id
// @access  Private
exports.getFeeSchedule = catchAsync(async (req, res, next) => {
	const { id } = req.params;

	const feeSchedule = await FeeSchedule.findOne({
		_id: id,
	});
	if (!feeSchedule) {
		return next(new ErrorResponse('Fee Schedule Not Found', 404));
	}
	res.status(200).json(SuccessResponse(feeSchedule, 1, 'Fetched Successfully'));
});

// @desc    Update a fee schedule
// @route   PUT /api/v1/feeSchedule/:id
// @access  Private
exports.update = async (req, res, next) => {
	const { id } = req.params;
	const {
		scheduleName,
		description,
		schoolId,
		day,
		months,
		existMonths,
		categoryId,
	} = req.body;
	let feeSchedule = await FeeSchedule.findOne({ _id: id }).lean();
	if (!feeSchedule) {
		return next(new ErrorResponse('Fee Schedule Not Found', 404));
	}

	const scheduledDates = getScheduleDates(months, day, existMonths);
	try {
		feeSchedule = await FeeSchedule.findOneAndUpdate(
			{ _id: id },
			{
				scheduleName,
				description,
				schoolId,
				scheduledDates,
				day,
				months,
				categoryId,
			},
			{ new: true }
		);
	} catch (error) {
		return next(new ErrorResponse('Something Went Wrong', 500));
	}
	res.status(200).json(SuccessResponse(feeSchedule, 1, 'Updated Successfully'));
};

// @desc    Delete a fee schedule
// @route   DELETE /api/v1/feeSchedule/:id
// @access  Private
exports.deleteFeeSchedule = catchAsync(async (req, res, next) => {
	const { id } = req.params;

	const feeSchedule = await FeeSchedule.findOneAndDelete({
		_id: id,
	});
	if (!feeSchedule) {
		return next(new ErrorResponse('Fee Schedule Not Found', 404));
	}
	res.status(200).json(SuccessResponse(null, 1, 'Deleted Successfully'));
});
