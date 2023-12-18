const mongoose = require('mongoose');

const mongoose_delete = require('mongoose-delete');

const { Schema, model } = mongoose;
// TODO: Make indexes for filters:

const discountSchema = new Schema({
	_id: 0,
	discountId: {
		type: Schema.Types.ObjectId,
		ref: 'DiscountCategory',
		required: true,
	},
	isPercentage: { type: Boolean, required: true },
	value: { type: Number, required: true },
	discountAmount: { type: Number, required: false, default: 0 }, // 80
	status: {
		type: String,
		enum: ['Pending', 'Approved', 'Rejected'],
		default: 'Pending',
	},
});

const FeeInstallmentSchema = new Schema(
	{
		feeTypeId: { type: Schema.Types.ObjectId, ref: 'Feetype', required: true }, // populate
		scheduleTypeId: {
			type: Schema.Types.ObjectId,
			ref: 'FeeSchedule',
			required: true,
		}, // populate
		feeType: {
			_id: { type: Schema.Types.ObjectId, ref: 'Feetype', required: true },
			name: { type: String, required: true },
		},
		rowId: {
			type: Schema.Types.ObjectId, // feeDetails _id
			required: true,
		}, // filter
		gender: {
			type: String,
			required: false,
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
		feeStructureId: {
			type: Schema.Types.ObjectId,
			ref: 'FeeStructure',
			required: true,
		}, // just for reference
		academicYearId: {
			type: Schema.Types.ObjectId,
			ref: 'AcademicYear',
			required: true,
		}, // populate
		classId: { type: Schema.Types.ObjectId, ref: 'Class', required: false },
		sectionId: { type: Schema.Types.ObjectId, ref: 'Section', required: true }, // filter
		schoolId: { type: Schema.Types.ObjectId, ref: 'School', required: true }, // filter
		studentId: {
			type: Schema.Types.ObjectId,
			ref: 'Student',
			required: true,
		}, // filter
		date: { type: Date, required: true },
		paidDate: { type: Date, required: false },
		totalAmount: { type: Number, required: true },
		discounts: {
			// 80
			type: [discountSchema],
			required: false,
			default: [],
		},
		totalDiscountAmount: { type: Number, required: false, default: 0 },
		paidAmount: { type: Number, required: false, default: 0 },
		netAmount: { type: Number, required: true }, // totalAmount - totalDiscountAmount
		status: {
			type: String,
			enum: ['Paid', 'Late', 'Upcoming', 'Due'],
			default: 'Upcoming',
		},
		categoryId: {
			type: Schema.Types.ObjectId,
			ref: 'FeeCategory',
			required: true,
		},
		concessionAmount: Number
	},
	{ timestamps: true }
);

// make index
FeeInstallmentSchema.index({ schoolId: 1, status: 1 });
FeeInstallmentSchema.index({
	studentId: 1,
	rowId: 1,
	date: 1,
});
FeeInstallmentSchema.index({
	'discounts.discountId': 1,
	'discounts.status': 1,
});
FeeInstallmentSchema.index({
	schoolId: 1,
	'discounts.status': 1,
});

FeeInstallmentSchema.plugin(mongoose_delete, {
	deletedAt: true,
	overrideMethods: true,
	deletedBy: true,
});

module.exports = model('FeeInstallment', FeeInstallmentSchema);
