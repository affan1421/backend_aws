const mongoose = require('mongoose');

const { Schema, model } = mongoose;

const classDiscountSchema = new Schema({
	section: {
		id: {
			type: Schema.Types.ObjectId,
			required: true,
		},
		name: String,
	},
	discount: {
		id: {
			type: Schema.Types.ObjectId,
			ref: 'DiscountCategory',
			required: true,
		},
		name: String,
	},
	schoolId: { type: Schema.Types.ObjectId, required: true },
	categoryId: {
		type: Schema.Types.ObjectId,
		ref: 'FeeCategory',
		required: true,
	},
	feeStructureId: {
		type: Schema.Types.ObjectId,
		ref: 'FeeStructure',
		required: true,
	},
	totalFeesAmount: Number,
	totalStudents: Number,
	totalApproved: Number,
	totalPending: Number,
	totalDiscountAmount: Number,
	totalApprovedAmount: Number,
});

classDiscountSchema.index({ 'discount.id': 1 });
classDiscountSchema.index({ schoolId: 1, categoryId: 1 });
classDiscountSchema.index({
	'discount.id': 1,
	'section.id': 1,
	feeStructureId: 1,
});

const ClassDiscount = model('classDiscount', classDiscountSchema);

module.exports = ClassDiscount;
