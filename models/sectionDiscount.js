// Classes collection model
const mongoose = require('mongoose');

const { Schema } = mongoose;

const sectionDiscountSchema = new Schema({
	discountId: {
		type: Schema.Types.ObjectId,
		ref: 'Discount',
		required: true,
	},
	feeStructureId: {
		type: Schema.Types.ObjectId,
		ref: 'FeeStructure',
		required: true,
	},
	sectionId: {
		type: Schema.Types.ObjectId,
		ref: 'Section',
		required: true,
	},
	schoolId: {
		type: Schema.Types.ObjectId,
		ref: 'School',
		required: true,
	},
	categoryId: {
		type: Schema.Types.ObjectId,
		ref: 'FeeCategory',
		required: true,
	},
	sectionName: {
		type: String,
		required: true,
	},
	totalAmount: {
		type: Number,
		required: true,
	},
	totalStudents: {
		type: Number,
		required: true,
	},
	totalApproved: {
		type: Number,
		required: false,
		default: 0,
	},
	totalPending: {
		type: Number,
		required: false,
		default: 0,
	},
	totalRejected: {
		type: Number,
		required: false,
		default: 0,
	},
	feeTypeId: {
		type: Schema.Types.ObjectId,
		ref: 'FeeType',
		required: true,
	},
	breakdown: {
		type: Number,
		required: true,
	},
	isPercentage: {
		type: Boolean,
		required: true,
	},
	discountAmount: {
		type: Number,
		required: true,
	},
	value: {
		type: Number,
		required: true,
	},
});

sectionDiscountSchema.index({ discountId: 1 });

sectionDiscountSchema.index({
	discountId: 1,
	sectionId: 1,
});

const SectionDiscount = mongoose.model(
	'sectionDiscount',
	sectionDiscountSchema
);

module.exports = SectionDiscount;
