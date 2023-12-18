const mongoose = require('mongoose');

const { Schema, model } = mongoose;

const previousBalanceSchema = new Schema(
	{
		isEnrolled: {
			type: Boolean,
			required: [true, 'Please Provide The IsEnrolled'],
		},
		schoolId: {
			type: Schema.Types.ObjectId,
			ref: 'School',
			required: [true, 'Please Provide The School'],
		},
		studentId: {
			type: Schema.Types.ObjectId,
			ref: 'Student',
		},
		studentName: {
			type: String,
			required: [true, 'Please Provide The Student Name'],
		},
		parentName: {
			type: String,
			required: [true, 'Please Provide The Parent Name'],
		},
		parentId: {
			type: Schema.Types.ObjectId,
			ref: 'Parent',
		},
		status: {
			type: String,
			required: true,
			enum: ['Due', 'Paid', 'Upcoming'],
		},
		lastPaidDate: Date,
		username: {
			type: String,
			required: [true, 'Please Provide The Mobile Number'],
		},
		gender: {
			type: String,
			required: [true, 'Please Provide The Gender'],
			enum: ['Male', 'Female'],
		},
		sectionId: {
			type: Schema.Types.ObjectId,
			ref: 'Section',
			required: [true, 'Please Provide The Section'],
		},
		academicYearId: {
			type: Schema.Types.ObjectId,
			ref: 'AcademicYear',
			required: [true, 'Please Provide The Academic Year'],
		},
		totalAmount: {
			type: Number,
			required: [true, 'Please Provide The Total Amount'],
		},
		paidAmount: {
			type: Number,
			default: 0,
		},
		dueAmount: {
			type: Number,
			required: [true, 'Please Provide The Due Amount'],
		},
		receiptIds: {
			type: [
				{
					type: Schema.Types.ObjectId,
					ref: 'FeeReceipt',
				},
			],
		},
	},
	{
		timestamps: true,
	}
);

const previousFeesBalance = model('previousFeesBalance', previousBalanceSchema);

module.exports = previousFeesBalance;
