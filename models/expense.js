const mongoose = require('mongoose');
const mongoose_delete = require('mongoose-delete');
const autoIncrement = require('mongoose-auto-increment');

autoIncrement.initialize(mongoose);

const expenseSchema = new mongoose.Schema(
	{
		reason: {
			type: String,
		},
		voucherNumber: {
			type: String,
			required: [true, 'Voucher Number is required'],
		},
		amount: {
			type: Number,
			required: [true, 'Amount is required'],
		},
		expenseDate: {
			type: Date,
			required: [true, 'Expense Date is required'],
		},
		paymentMethod: {
			type: String,
			required: [true, 'Payment Method is required'],
			enum: [
				'CASH',
				'CHEQUE',
				'ONLINE_TRANSFER',
				'UPI',
				'DD',
				'DEBIT_CARD',
				'CREDIT_CARD',
			],
		},
		transactionDetails: {
			transactionId: String,
			ChequeNo: Number,
			screenShot: String,
		},
		schoolId: {
			type: mongoose.Schema.Types.ObjectId,
			ref: 'School',
			required: [true, 'School is required'],
		},
		expenseType: {
			type: mongoose.Schema.Types.ObjectId,
			ref: 'ExpenseType',
			required: [true, 'Expense Type is required'],
		},
		createdBy: {
			type: mongoose.Schema.Types.ObjectId,
			ref: 'User', // change model name if wrong
			required: [true, 'Created By is required'],
		},
		approvedBy: {
			type: String,
		},
	},
	{
		timestamps: true,
	}
);

// index voucherNumber
// expenseSchema.index({ voucherNumber: 'text' });

// index approvedBy
expenseSchema.index({ approvedBy: 'text' });

// index amount number
expenseSchema.index({ amount: 1 });

expenseSchema.plugin(mongoose_delete, {
	deletedAt: true,
	deletedBy: true,
	overrideMethods: true,
});

module.exports = mongoose.model('Expense', expenseSchema);
