const mongoose = require('mongoose');
const mongoose_delete = require('mongoose-delete');
const {
	addAcademicYearId,
	filterByActiveAcademicYearMiddleware,
} = require('../middleware/academicYear');

const { Schema } = mongoose;

const discountSchema = new Schema(
	{
		name: {
			type: String,
			required: true,
			trim: true,
		},
		description: {
			type: String,
			required: false,
			default: '',
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
		classesAssociated: {
			type: Number,
			required: false,
			default: 0,
		},
		totalBudget: {
			type: Number,
			required: false,
			default: 0,
		},
		// pending + approved
		budgetAlloted: {
			type: Number,
			required: false,
			default: 0,
		},
		// approved
		budgetRemaining: {
			type: Number,
			required: false,
			default: 0,
		},
		totalStudents: {
			type: Number,
			required: false,
			default: 0,
		},
		totalApproved: {
			type: Number,
			required: false,
			default: 0,
		},
		totalPending: {
			type: Number,
			required: false,
			default: 0,
		},
		createdBy: {
			type: Schema.Types.ObjectId,
			ref: 'User',
			required: true,
		},
		// Reference to the student
		// attachments: {
		// 	"studentId": ["http://imageLink.com", "http://imageLink.com"]
		// }
		attachments: {
			type: Object,
		},
	},
	{ timestamps: true }
);

discountSchema.pre('save', addAcademicYearId);
discountSchema.pre('aggregate', filterByActiveAcademicYearMiddleware);
discountSchema.pre('findOne', filterByActiveAcademicYearMiddleware);
discountSchema.pre('findOneAndUpdate', filterByActiveAcademicYearMiddleware);

discountSchema.plugin(mongoose_delete, {
	deletedAt: true,
	overrideMethods: true,
	deletedBy: true,
});

module.exports = mongoose.model('DiscountCategory', discountSchema);
