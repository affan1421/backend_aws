const mongoose = require('mongoose');

const { Schema, model } = mongoose;

const donationSchema = new Schema(
	{
		amount: {
			type: Number,
			required: true,
		},
		date: {
			type: Date,
			required: true,
		},
		donorId: {
			type: Schema.Types.ObjectId,
			ref: 'Donor',
			required: true,
		},
		paymentType: {
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
			required: true,
		},
		studentId: {
			type: Schema.Types.ObjectId,
			ref: 'Student',
		},
		sectionId: {
			type: Schema.Types.ObjectId,
			ref: 'Section',
		},
	},
	{
		timestamps: true,
	}
);

const Donation = model('Donation', donationSchema);

module.exports = Donation;
