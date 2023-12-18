const mongoose = require('mongoose');

const { Schema, model } = mongoose;

const studentTransferSchema = new Schema(
	{
		studentId: {
			type: Schema.Types.ObjectId,
			ref: 'School',
			required: [true, 'studentId is required'],
		},
		schoolId: {
			type: Schema.Types.ObjectId,
			ref: 'School',
			required: [true, 'School Id is required'],
		},
		classId: {
			type: Schema.Types.ObjectId,
			ref: 'Class',
			required: [true, 'classId is required'],
		},
		tcType: {
			type: String,
			enum: ['ALUMINI-TC', 'AVAIL-TC', 'BLOCKED'],
			required: [true, 'Type is required'],
		},
		reason: {
			type: Schema.Types.ObjectId,
			ref: 'tcReasons',
			required: [true, 'Tc reason is required'],
		},
		comment: String,
		transferringSchool: String,
		status: {
			type: String,
			enum: ['PENDING', 'APPROVED', 'REJECTED'],
			default: 'PENDING',
		},
		attachments: {
			type: [String],
		},
	},
	{ timestamps: true }
);

const StudentTransfer = model('StudentTransfer', studentTransferSchema);

module.exports = StudentTransfer;
