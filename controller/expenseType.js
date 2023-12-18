const mongoose = require('mongoose');
const ExpenseType = require('../models/expenseType');
const ErrorResponse = require('../utils/errorResponse');
const catchAsync = require('../utils/catchAsync');
const SuccessResponse = require('../utils/successResponse');

// CREATE
exports.create = async (req, res, next) => {
	const { name, schoolId, userId, description, budget, remainingBudget } =
		req.body;
	if (!userId || !schoolId || !budget) {
		return next(new ErrorResponse('All Fields are Mandatory', 422));
	}

	const isExist = await ExpenseType.findOne({ name, schoolId });
	if (isExist) {
		return next(new ErrorResponse('Expense Type Already Exist', 400));
	}

	let newExpenseType;
	try {
		newExpenseType = await ExpenseType.create({
			name,
			schoolId,
			userId,
			description,
			budget,
			remainingBudget,
		});
	} catch (error) {
		console.log('error', error);
		return next(new ErrorResponse('Something Went Wrong', 500));
	}
	return res
		.status(201)
		.json(SuccessResponse(newExpenseType, 1, 'Created Successfully'));
};

// GET
exports.getTypes = catchAsync(async (req, res, next) => {
	let { schoolId, name, userId, page = 0, limit = 5 } = req.query;
	page = +page;
	limit = +limit;
	const payload = {};
	if (schoolId) {
		payload.schoolId = mongoose.Types.ObjectId(schoolId);
	}
	if (userId) {
		payload.userId = mongoose.Types.ObjectId(userId);
	}
	if (name) {
		payload.name = name;
	}
	const expenseTypes = await ExpenseType.aggregate([
		{
			$facet: {
				data: [{ $match: payload }, { $skip: page * limit }, { $limit: limit }],
				count: [{ $match: payload }, { $count: 'count' }],
			},
		},
	]);
	const { data, count } = expenseTypes[0];

	if (count.length === 0) {
		return next(new ErrorResponse('No Expense Type Found', 404));
	}
	res
		.status(200)
		.json(SuccessResponse(data, count[0].count, 'Fetched Successfully'));
});

// GET
exports.getExpenseTypesBySchool = catchAsync(async (req, res, next) => {
	const { schoolId = null } = req.query;

	if (!schoolId) {
		return next(new ErrorResponse('SchoolId is requried', 400));
	}

	const payload = {
		schoolId: mongoose.Types.ObjectId(schoolId),
	};

	const expenseTypes = await ExpenseType.aggregate([
		{
			$facet: {
				data: [{ $match: payload }],
				count: [{ $match: payload }, { $count: 'count' }],
			},
		},
	]);

	const { data, count } = expenseTypes[0];

	if (count.length === 0) {
		return next(new ErrorResponse('No Expense Type Found', 404));
	}
	res
		.status(200)
		.json(SuccessResponse(data, count[0].count, 'Fetched Successfully'));
});

// READ
exports.read = catchAsync(async (req, res, next) => {
	const { id } = req.params;
	// const { school_id: schoolId } = req.user;

	const expensetype = await ExpenseType.findOne({
		_id: id,
		// schoolId,
	});
	if (expensetype === null) {
		return next(new ErrorResponse('Expense Type Not Found', 404));
	}
	res.status(200).json(SuccessResponse(expensetype, 1, 'Fetched Successfully'));
});

// UPDATE
exports.update = catchAsync(async (req, res, next) => {
	const { id } = req.params;

	const { budget, remainingBudget } = req.body;

	const { budget: oldBudget, remainingBudget: oldRemainingBudget } =
		await ExpenseType.findOne({ _id: id });

	const spent = oldBudget - oldRemainingBudget;
	const diff = budget - oldBudget;

	if (budget < spent) {
		return next(
			new ErrorResponse('Cannot Update Budget, Enter Greater Amount', 400)
		);
	}
	req.body.remainingBudget += diff;
	const expensetype = await ExpenseType.findOneAndUpdate(
		{ _id: id },
		{
			...req.body,
		}
	);
	if (expensetype === null) {
		return next(new ErrorResponse('Expense Type Not Found', 404));
	}
	res.status(200).json(SuccessResponse(expensetype, 1, 'Updated Successfully'));
});

// DELETE
exports.expenseDelete = catchAsync(async (req, res, next) => {
	const { id } = req.params;
	const { school_id: schoolId } = req.user;

	const expensetype = await ExpenseType.findOneAndDelete({
		_id: id,
		schoolId,
	});
	if (expensetype === null) {
		return next(new ErrorResponse('Expense Type Not Found', 404));
	}
	res.status(200).json(SuccessResponse(null, 1, 'Deleted Successfully'));
});
