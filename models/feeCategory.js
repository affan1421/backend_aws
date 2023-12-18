const { Schema, model } = require('mongoose');
const mongoose_delete = require('mongoose-delete');
const {
	addAcademicYearId,
	filterByActiveAcademicYearMiddleware,
} = require('../middleware/academicYear');

const feeCategorySchema = new Schema(
	{
		name: {
			type: String,
			required: true,
			trim: true,
		},
		schoolId: {
			type: Schema.Types.ObjectId,
			ref: 'School',
			required: true,
		},
		academicYearId: {
			type: Schema.Types.ObjectId,
			ref: 'AcademicYear',
			required: false,
		},
		description: {
			type: String,
			trim: true,
			default: '',
		},
	},
	{
		timestamps: true,
	}
);

feeCategorySchema.plugin(mongoose_delete, {
	deletedAt: true,
	deletedBy: true,
	overrideMethods: true,
});

feeCategorySchema.pre('save', addAcademicYearId);
feeCategorySchema.pre('find', filterByActiveAcademicYearMiddleware);
feeCategorySchema.pre('findOne', filterByActiveAcademicYearMiddleware);
feeCategorySchema.pre('aggregate', filterByActiveAcademicYearMiddleware);

module.exports = model('FeeCategory', feeCategorySchema);
