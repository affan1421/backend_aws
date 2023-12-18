const { Schema, model } = require('mongoose');
const mongoose_delete = require('mongoose-delete');

const donorSchema = new Schema(
	{
		name: {
			type: String,
		},
		email: {
			type: String,
		},
		address: {
			type: String,
		},
		profileImage: {
			type: String,
		},
		contactNumber: {
			type: Number,
		},
		IFSC: {
			type: String,
		},
		bank: {
			type: String,
		},
		accountNumber: {
			type: Number,
		},
		accountType: {
			type: String,
			enum: [
				'Savings',
				'Current',
				'FixedDeposit',
				'Assets',
				'Liabilities',
				'Equity',
				'Revenue',
				'Expenses',
				'Debits',
				'Credits',
				'AccountsPayable',
				'AccountsReceivable',
				'Cash',
			],
			required: [true, 'Please enter account type'],
		},
		totalAmount: {
			type: Number,
			default: 0,
		},
		donorType: {
			type: String,
			enum: ['INDIVIDUAL', 'TRUST', 'COMPANY'],
			required: [true, 'Please enter donor type'],
		},
		schoolId: {
			type: Schema.Types.ObjectId,
			ref: 'School',
			required: [true, 'Please Enter SchoolId'],
		},
	},
	{ timestamps: true }
);

const options = {
	deletedAt: true,
	overrideMethods: true,
	deletedBy: true,
};

donorSchema.plugin(mongoose_delete, options);

const Donor = model('Donor', donorSchema);

module.exports = Donor;
