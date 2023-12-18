const mongoose = require('mongoose');
const AcademicYear = require('../models/academicYear');
const ErrorResponse = require('../utils/errorResponse');
const SuccessResponse = require('../utils/successResponse');
const catchAsync = require('../utils/catchAsync');
const FeeTypes = require('../models/feeType');
const FeeSchedule = require('../models/feeSchedule');

function parseCustomDate(dateString) {
	const [day, month, year] = dateString.split('/');
	return new Date(`${year}-${month}-${day}`);
}

// Create a new AcademicYear
const create = async (req, res, next) => {
	try {
		const timezoneOffset = new Date().getTimezoneOffset();
		let { name, startDate, endDate, schoolId } = req.body;
		let isActive = true;
		if (!name || !startDate || !endDate || !schoolId) {
			return next(new ErrorResponse('Please Provide All Required Fields', 422));
		}
		const isExists = await AcademicYear.find({
			schoolId,
		}).lean();
		// check isExists and set isActive false
		if (isExists.length > 0) {
			isActive = false;
		}

		const nameObj = isExists.find(item => item.name === name);

		// check for name
		if (nameObj) {
			return next(
				new ErrorResponse(`Academic Year ${name} Already Exists`, 422)
			);
		}

		const months = [];
		startDate = parseCustomDate(startDate);
		const tempDate = parseCustomDate(req.body.startDate);
		endDate = parseCustomDate(endDate);
		if (startDate > endDate) {
			return next(
				new ErrorResponse('Start Date Should Be Less Than End Date', 422)
			);
		}
		while (tempDate <= endDate) {
			months.push(tempDate.getMonth() + 1);
			tempDate.setMonth(tempDate.getMonth() + 1);
		}
		// Adjust for timezone offset
		const adjustedMonths = months.map(month => {
			const date = new Date(Date.UTC(startDate.getFullYear(), month - 1, 1));
			date.setMinutes(date.getMinutes() + timezoneOffset);
			return date.getMonth() + 1;
		});
		const academicYear = await AcademicYear.create({
			name,
			startDate,
			endDate,
			schoolId,
			months: adjustedMonths,
			isActive,
		});
		res
			.status(201)
			.json(SuccessResponse(academicYear, 1, 'Created Successfully'));
	} catch (error) {
		console.error(error);
		return next(new ErrorResponse('Something Went Wrong', 500));
	}
};

// Get all AcademicYears
const getAll = catchAsync(async (req, res, next) => {
	let { schoolId, isActive = null, page = 0, limit = 5 } = req.query;
	page = +page;
	limit = +limit;
	const payload = {};
	if (schoolId) {
		payload.schoolId = mongoose.Types.ObjectId(schoolId);
	}
	if (isActive != null) {
		payload.isActive = true;
	}
	const academicYears = await AcademicYear.aggregate([
		{
			$facet: {
				data: [{ $match: payload }, { $skip: page * limit }, { $limit: limit }],
				docCount: [{ $match: payload }, { $count: 'count' }],
			},
		},
	]);
	const { data, docCount } = academicYears[0];

	if (docCount.length === 0) {
		return next(new ErrorResponse('Academic years Not Found', 404));
	}
	res
		.status(200)
		.json(SuccessResponse(data, docCount[0].count, 'Fetched Successfully'));
});

// Get Previous Academic Year
const getPreviousAcademicYear = catchAsync(async (req, res, next) => {
	const { school_id } = req.user;

	const academicYears = await AcademicYear.find({
		schoolId: school_id,
	})
		.sort({ startDate: -1 })
		.skip(1)
		.lean();

	if (academicYears.length === 0) {
		return next(new ErrorResponse('Previous Academic Years Not Found', 404));
	}

	res
		.status(200)
		.json(
			SuccessResponse(
				academicYears,
				academicYears.length,
				'Fetched Successfully'
			)
		);
});

// Get an AcademicYear by ID
const getAcademicYear = catchAsync(async (req, res, next) => {
	const { id } = req.params;
	const academicYear = await AcademicYear.findOne({ _id: id });
	if (!academicYear) {
		return next(new ErrorResponse('Academic year Not Found', 404));
	}

	res
		.status(200)
		.json(SuccessResponse(academicYear, 1, 'Fetched Successfully'));
});

const changeState = catchAsync(async (req, res, next) => {
	const { id, isActive } = req.body;
	if (!id || isActive == null) {
		return next(new ErrorResponse('Please Provide All Required Fields', 422));
	}
	const academicYear = await AcademicYear.findOneAndUpdate(
		{
			_id: id,
		},
		{
			isActive,
		},
		{
			new: true,
		}
	);
	if (!academicYear) {
		return next(new ErrorResponse('Academic Year Not Found', 404));
	}
	if (academicYear.isActive) {
		await AcademicYear.updateMany(
			{ _id: { $ne: id }, isActive: true, schoolId: academicYear.schoolId },
			{ isActive: false }
		);
	}
	res
		.status(200)
		.json(SuccessResponse(academicYear, 1, 'Updated Successfully'));
});

// Update an AcademicYear by ID
const update = async (req, res, next) => {
	try {
		const { id } = req.params;
		const isScheduleMapped = await FeeSchedule.findOne({
			academicYearId: id,
			schoolId: req.body.schoolId,
		});

		if (isScheduleMapped) {
			return next(
				new ErrorResponse(
					'Academic Year Is Already Mapped With Fee Schedule',
					422
				)
			);
		}

		const { startDate, endDate } = req.body;
		if (startDate && endDate) {
			const months = [];
			const start = new Date(startDate);
			const end = new Date(endDate);
			if (start > end) {
				return next(
					new ErrorResponse('Start Date Should Be Less Than End Date', 422)
				);
			}
			while (start <= end) {
				months.push(start.getMonth() + 1);
				start.setMonth(start.getMonth() + 1);
			}
			req.body.months = months;
		}

		const academicYear = await AcademicYear.findOneAndUpdate(
			{ _id: id },
			req.body,
			{
				new: true,
				runValidators: true,
			}
		);
		if (!academicYear) {
			return next(new ErrorResponse('Academic year Not Found', 404));
		}
		if (academicYear.isActive) {
			await AcademicYear.updateMany(
				{ _id: { $ne: id }, isActive: true, schoolId: req.body.schoolId },
				{ isActive: false }
			);
		}
		res
			.status(200)
			.json(SuccessResponse(academicYear, 1, 'Updated Successfully'));
	} catch (error) {
		console.log('error', error);
		return next(new ErrorResponse('Something Went Wrong', 500));
	}
};

// Delete an AcademicYear by ID
const deleteAcademicYear = async (req, res, next) => {
	try {
		const { id } = req.params;
		const { school_id: schoolId } = req.user;
		const isTypeMapped = await FeeTypes.findOne({
			academicYearId: id,
			schoolId,
		});
		const isScheduleMapped = await FeeSchedule.findOne({
			academicYearId: id,
			schoolId,
		});
		if (isTypeMapped || isScheduleMapped) {
			return next(
				new ErrorResponse(
					'Academic Year Is Already Mapped With Fee Type Or Fee Schedule',
					422
				)
			);
		}
		const academicYear = await AcademicYear.findOneAndDelete({ _id: id });
		if (!academicYear) {
			return next(new ErrorResponse('Academic year Not Found', 404));
		}
		res.status(200).json(SuccessResponse(null, 1, 'Deleted Successfully'));
	} catch (error) {
		console.log('error', error);
		return next(new ErrorResponse('Something Went Wrong', 500));
	}
};

module.exports = {
	create,
	getAll,
	getAcademicYear,
	update,
	changeState,
	getPreviousAcademicYear,
	deleteAcademicYear,
};
