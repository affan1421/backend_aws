const mongoose = require('mongoose');
const mongoose_delete = require('mongoose-delete');
const {
	addAcademicYearId,
	filterByActiveAcademicYearMiddleware,
} = require('../middleware/academicYear');

const { Schema, model } = mongoose;

const feeDetailsSchema = new Schema({
	feeTypeId: {
		type: Schema.Types.ObjectId,
		ref: 'Feetype',
		required: [true, 'Fee Type is Mandatory'],
	},
	scheduleTypeId: {
		type: Schema.Types.ObjectId,
		ref: 'FeeSchedule',
		required: [true, 'Fee Schedule is Mandatory'],
	},
	scheduledDates: {
		type: [
			{
				date: Date,
				amount: Number,
			},
		],
	},
	totalAmount: Number,
	breakdown: Number,
});

const feeStructureSchema = new Schema(
	{
		feeStructureName: {
			type: String,
			required: [true, 'Fee Structure Name is Mandatory'],
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
			required: [false, 'Academic Year is Mandatory'],
		},
		schoolId: {
			type: Schema.Types.ObjectId,
			ref: 'School',
			required: [true, 'School is Mandatory'],
		},
		categoryId: {
			type: Schema.Types.ObjectId,
			ref: 'FeeCategory',
			required: [true, 'Fee Category is Mandatory'],
		},
		classes: {
			type: [
				{
					name: String,
					sectionId: {
						type: Schema.Types.ObjectId,
						ref: 'Section',
						required: true,
					},
				},
			],
			default: [],
		},
		description: String,
		feeDetails: {
			type: [feeDetailsSchema],
			required: [true, 'Fee Details are Mandatory'],
		},

		totalAmount: {
			type: Number,
			required: [true, 'Total Amount is Mandatory'],
		},
	},
	{ timestamps: true }
);

feeStructureSchema.plugin(mongoose_delete, {
	deletedAt: true,
	overrideMethods: true,
	deletedBy: true,
});

feeStructureSchema.pre('save', addAcademicYearId);
feeStructureSchema.pre('find', filterByActiveAcademicYearMiddleware);
feeStructureSchema.pre('findOne', filterByActiveAcademicYearMiddleware);
feeStructureSchema.pre('aggregate', filterByActiveAcademicYearMiddleware);

module.exports = model('FeeStructure', feeStructureSchema);
