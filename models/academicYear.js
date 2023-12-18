const mongoose = require('mongoose');

const mongoose_delete = require('mongoose-delete');

const { Schema, model } = mongoose;

const academicYearSchema = new Schema(
	{
		name: {
			type: String, // 2023-2024
			required: [true, 'Please add a name'],
			trim: true,
		},
		startDate: {
			type: Date, // 2023-05-01T00:00:00.000Z
			required: [true, 'Please add a start date'],
		},
		endDate: {
			type: Date, // 2024-05-01T00:00:00.000Z
			required: [true, 'Please add an end date'],
		},
		isActive: {
			type: Boolean, // true
			default: true,
		},
		months: {
			type: [Number], // [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]
			required: [true, 'Please add months'],
		},
		schoolId: {
			type: Schema.Types.ObjectId, // 60a1b0b0b8b5f0b0b8b5f0b0
			ref: 'School',
			required: [true, 'Please add a school id'],
		},
	},
	{ timestamps: true }
);

academicYearSchema.plugin(mongoose_delete, {
	deletedAt: true,
	deletedBy: true,
	overrideMethods: true,
});

module.exports = model('AcademicYear', academicYearSchema);
