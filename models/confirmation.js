const mongoose = require('mongoose');

const { Schema, model } = mongoose;

const confirmationSchema = new Schema({
	feeDetails: {
		type: Array,
		required: true,
	},
	studentId: {
		type: Schema.Types.ObjectId,
		ref: 'Student',
		required: true,
	},
	collectedFee: {
		type: Number,
		required: true,
	},
	comments: {
		type: String,
		required: false,
		default: '',
	},
	totalFeeAmount: {
		type: Number,
		required: true,
	},
	dueAmount: {
		type: Number,
		required: true,
	},
	//
	status: {
		type: String,
		enum: ['REQUESTED', 'APPROVED', 'REJECTED'],
	},
	// Rejection reason and re-request
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
	//
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
	date: {
		type: Date,
		required: false,
		default: Date.now,
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
		required: [true, 'Receipt type is required'],
		default: 'ACADEMIC',
		enum: ['ACADEMIC', 'APPLICATION', 'MISCELLANEOUS', 'PREVIOUS_BALANCE'],
	},
	attachments: {
		type: Array,
		required: false,
	},
});

const Confirmation = model('Confirmation', confirmationSchema);

module.exports = Confirmation;
