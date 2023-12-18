// Require mongoose and mongoose schema
const { Schema, model } = require('mongoose');
const mongoose_delete = require('mongoose-delete');

const applicationFeeSchema = new Schema(
	{
		studentName: String,
		className: String,
		classId: {
			type: Schema.Types.ObjectId,
			ref: 'Class',
			required: [true, 'classId is required'],
		},
		sectionId: {
			type: Schema.Types.ObjectId,
			ref: 'Section',
			required: [true, 'sectionId is required'],
		},
		parentType: {
			type: String,
			enum: ['FATHER', 'MOTHER', 'GUARDIAN', 'OTHER'],
			required: [true, 'Parent Type is required'],
		},
		parentName: String,
		phoneNumber: Number,
		gender: {
			type: String,
			enum: ['Male', 'Female'],
		},
		isEnrolled: {
			type: Boolean,
			default: false,
		},
		course: {
			type: String,
			default: '',
		},
		amount: {
			type: Number,
			required: [true, 'Amount Is Required'],
		},
		receiptId: {
			type: Schema.Types.ObjectId,
			required: [true, 'Receipt id is required'],
			ref: 'FeeReceipt',
		},
		schoolId: {
			type: Schema.Types.ObjectId,
			ref: 'School',
			required: [true, 'schoolId is required'],
		},
		academicYearId: {
			type: Schema.Types.ObjectId,
			ref: 'AcademicYear',
			required: [true, 'academicYearId is required'],
		},
		feeTypeId: {
			type: Schema.Types.ObjectId,
			ref: 'FeeType',
			required: [true, 'feeTypeId is required'],
		},
	},
	{ timestamps: true }
);

// index schoolId and academicYearId
applicationFeeSchema.index({
	schoolId: 1,
	academicYearId: 1,
});

applicationFeeSchema.index({
	schoolId: 1,
	academicYearId: 1,
	classId: 1,
});

// soft delete plugin
applicationFeeSchema.plugin(mongoose_delete, {
	deletedAt: true,
	deletedBy: true,
	overrideMethods: true,
});

module.exports = model('ApplicationFee', applicationFeeSchema);
