const mongoose = require('mongoose');
const ErrorResponse = require('../utils/errorResponse');
const academicYearModel = require('../models/academicYear');

async function filterByActiveAcademicYearMiddleware(next) {
	let schoolId;
	let pipeline;
	let isAggregation;
	let activeAcademicYear = null;
	if (this._conditions) {
		if (this._conditions._id) next();
		// For find and findOne
		schoolId = this._conditions.schoolId;
		isAggregation = false;
	} else if (this._pipeline) {
		// For aggregate
		const [facet] = this._pipeline.filter(stage => stage.$facet);
		const matchStage =
			facet?.$facet?.data[0].$match || this._pipeline[1].$match;
		schoolId = matchStage.schoolId;
		pipeline = this._pipeline;
		isAggregation = true;
	}
	activeAcademicYear = await academicYearModel
		.findOne({ isActive: true, schoolId })
		.lean();
	if (!activeAcademicYear) {
		return next(new ErrorResponse('Please Select An Academic Year', 400));
	}
	const activeAcademicYearId = activeAcademicYear._id;

	const filter = {
		$match: {
			academicYearId: mongoose.Types.ObjectId(activeAcademicYearId),
		},
	};

	if (isAggregation) {
		if (pipeline.length > 0) {
			pipeline.unshift(filter);
		} else {
			pipeline.push(filter);
		}
	} else {
		const conditions = {
			$and: [
				{ academicYearId: mongoose.Types.ObjectId(activeAcademicYearId) },
				this._conditions,
			],
		};
		this._conditions = conditions;
	}

	next();
}

async function addAcademicYearId(next) {
	const { schoolId } = this;
	if (!this.get('academicYearId')) {
		const activeAcademicYear = await academicYearModel
			.findOne({ isActive: true, schoolId })
			.lean()
			.exec();
		if (!activeAcademicYear) {
			return next(new ErrorResponse('Please Select An Academic Year', 400));
		}

		this.academicYearId = activeAcademicYear._id;
	}

	next();
}

module.exports = { addAcademicYearId, filterByActiveAcademicYearMiddleware };
