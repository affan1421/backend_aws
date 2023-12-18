const mongoose = require('mongoose');

const { Schema, model } = mongoose;

const breakdownSchema = new Schema({
	_id: false,
	date: Date,
	amount: Number,
	value: Number,
});

const feeTypeSchema = new Schema({
	_id: false,
	id: Schema.Types.ObjectId,
	name: String,
});

const feeDetailSchema = new Schema({
	_id: false,
	feeType: feeTypeSchema,
	amount: Number, // Fee amount
	isPercentage: Boolean,
	value: Number,
	discountAmount: Number,
	breakdown: [breakdownSchema],
});

const discountStructureSchema = new Schema(
	{
		discountId: {
			type: Schema.Types.ObjectId,
			ref: 'DiscountCategory',
			required: true,
		},
		categoryId: {
			type: Schema.Types.ObjectId,
			ref: 'FeeCategory',
			required: true,
		},
		schoolId: { type: Schema.Types.ObjectId, required: true },
		feeStructureId: {
			type: Schema.Types.ObjectId,
			ref: 'FeeStructure',
			required: true,
		},
		totalFeesAmount: Number,
		feeDetails: [feeDetailSchema],
	},
	{
		timestamps: true,
	}
);

const DiscountStructure = model('discountStructure', discountStructureSchema);

module.exports = DiscountStructure;
