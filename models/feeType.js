const { Schema, model } = require('mongoose');
const mongoose_delete = require('mongoose-delete');
const {
	addAcademicYearId,
	filterByActiveAcademicYearMiddleware,
} = require('../middleware/academicYear');

const feetypeSchema = new Schema(
	{
		feeType: {
			type: String,
			required: [true, 'Please enter feetype name'],
			trim: true,
		},
		description: {
			type: String,
			required: [false, 'Please enter feetype description'],
			default: '',
			trim: true,
		},
		deleted: {
			type: Boolean,
			default: false,
		},
		deletedAt: {
			type: Date,
			default: null,
		},
		deletedBy: {
			type: Schema.Types.ObjectId,
			ref: 'User',
			default: null,
		},
		accountType: {
			type: String,
			enum: [
				'Savings',
				'Current',
				'FixedDeposit',
				'Assets',
				'Liabilities',
				'Equity',
				'Revenue',
				'Expenses',
				'Debits',
				'Credits',
				'AccountsPayable',
				'AccountsReceivable',
				'Cash',
			],
			required: [true, 'Please enter account type'],
		},
		feeCategory: {
			type: String,
			enum: ['APPLICATION', 'ACADEMIC', 'MISCELLANEOUS', 'PREVIOUS'],
		},
		categoryId: {
			type: Schema.Types.ObjectId,
			ref: 'FeeCategory',
			required: [false, 'Please enter category id'],
		},
		academicYearId: {
			type: Schema.Types.ObjectId,
			ref: 'AcademicYear',
			required: [false, 'Please enter academic year id'],
		},
		schoolId: {
			type: Schema.Types.ObjectId,
			ref: 'School',
			required: [true, 'Please enter school id'],
		},
		isMisc: {
			type: Boolean,
			default: false,
		},
	},
	{ timestamps: true }
);

const options = {
	deletedAt: true,
	overrideMethods: true,
	deletedBy: true,
};

feetypeSchema.pre('save', addAcademicYearId);
feetypeSchema.pre('find', filterByActiveAcademicYearMiddleware);
feetypeSchema.pre('findOne', filterByActiveAcademicYearMiddleware);
feetypeSchema.pre('aggregate', filterByActiveAcademicYearMiddleware);
feetypeSchema.plugin(mongoose_delete, options);

const Feetype = model('Feetype', feetypeSchema);

module.exports = Feetype;
