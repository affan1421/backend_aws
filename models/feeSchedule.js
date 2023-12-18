const mongoose = require('mongoose');
const mongoose_delete = require('mongoose-delete');
const {
	addAcademicYearId,
	filterByActiveAcademicYearMiddleware,
} = require('../middleware/academicYear');

const { Schema, model } = mongoose;

const feeScheduleSchema = new Schema(
	{
		scheduleName: {
			type: String,
			required: [true, 'Please add a schedule name'],
			trim: true,
		},
		description: {
			type: String,
			required: [false, 'Please add a description'],
			default: '',
			trim: true,
		},
		deleted: {
			type: Boolean,
			default: false,
		},
		deletedAt: {
			type: Date,
			default: null,
		},
		deletedBy: {
			type: Schema.Types.ObjectId,
			ref: 'User',
			default: null,
		},
		academicYearId: {
			type: Schema.Types.ObjectId,
			ref: 'AcademicYear',
			required: [false, 'Please add an academic year id'],
		},
		day: {
			type: Number,
			required: [true, 'Please add a day'],
		},
		months: {
			type: [Number],
			required: [true, 'Please add months'],
		},
		categoryId: {
			type: Schema.Types.ObjectId,
			ref: 'FeeCategory',
			required: [true, 'Please add a category id'],
		},
		schoolId: {
			type: Schema.Types.ObjectId,
			ref: 'School',
			required: [true, 'Please add a school id'],
		},
		// The array will be received as date string from frontend
		scheduledDates: {
			type: [Date],
			required: false,
			default: [],
		},
	},
	{ timestamps: true }
);

feeScheduleSchema.plugin(mongoose_delete, {
	deletedAt: true,
	overrideMethods: true,
	deletedBy: true,
});

feeScheduleSchema.pre('save', addAcademicYearId);
feeScheduleSchema.pre('find', filterByActiveAcademicYearMiddleware);
feeScheduleSchema.pre('findOne', filterByActiveAcademicYearMiddleware);
feeScheduleSchema.pre('aggregate', filterByActiveAcademicYearMiddleware);

module.exports = model('FeeSchedule', feeScheduleSchema);
