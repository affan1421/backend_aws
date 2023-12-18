// Every field in the make payment payload
/*
const makePayment = {
		feeDetails,
		studentId,
		collectedFee,
		comments,
		totalFeeAmount,
		dueAmount,
		paymentMethod,
		bankName,
		chequeDate,
		chequeNumber,
		transactionDate,
		transactionId,
		donorId = null,
		upiId,
		payerName,
		ddNumber,
		ddDate,
		issueDate = new Date(),
		feeCategoryName,
		feeCategoryId,
		receiptType,
	} 
*/
const mongoose = require('mongoose');

const { Schema, model } = mongoose;
const confirmationSchema = new Schema({
	feeDetails: {
		type: Array,
		required: true,
	},
	studentId: {
		type: mongoose.Types.ObjectId,
		ref: 'Student',
		required: true,
	},
	collectedFee: {
		type: Number,
		required: true,
	},
	// COMMENT TO REFLECT ON THE RECEIPT : NOTE
	comments: {
		type: String,
		required: false,
		default: '',
	},
	// total fee amount
	totalFeeAmount: {
		type: Number,
		required: true,
	},
	// must be including the previous balance
	dueAmount: {
		type: Number,
		required: true,
	},
	payment: {
		method: {
			type: String,
			enum: [
				'CASH',
				'CHEQUE',
				'ONLINE_TRANSFER',
				'UPI',
				'DD',
				'DEBIT_CARD',
				'CREDIT_CARD',
			],
			required: [true, 'payment method is required'],
		},
		bankName: String,
		chequeDate: Date,
		chequeNumber: Number,
		transactionDate: Date,
		transactionId: String,
		upiId: String,
		payerName: String,
		ddNumber: Number,
		ddDate: Date,
	},
	status: {
		type: String,
		enum: ['REQUESTED', 'APPROVED', 'REJECTED'],
	},
	// cancellation reason
	reasons: {
		type: [
			{
				reason: String,
				date: Date,
				status: {
					type: String,
					enum: ['REQUESTED', 'REJECTED'],
				},
			},
		],
	},
	donorId: {
		type: mongoose.Types.ObjectId,
		ref: 'Donor',
		required: false,
	},
	issueDate: {
		type: Date,
		required: false,
		default: Date.now, // 2021-03-03T06:59:59.999Z
	},
	feeCategoryName: {
		type: String,
		required: false,
	},
	feeCategoryId: {
		type: String,
		required: false,
	},
	receiptType: {
		type: String,
		required: false,
	},
});

module.exports = model('Confirmation', confirmationSchema);
