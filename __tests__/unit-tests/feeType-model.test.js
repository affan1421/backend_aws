/* eslint-disable no-undef */
const mongoose = require('mongoose');
const Feetype = require('../../models/feeType');

describe('Feetype Model', () => {
	it('should be invalid if required fields are empty', () => {
		const feetype = new Feetype();

		const error = feetype.validateSync();
		expect(error.errors.feeType.message).toEqual('Please enter feetype name');

		expect(error.errors.accountType.message).toEqual(
			'Please enter account type'
		);
		expect(error.errors.schoolId.message).toEqual('Please enter school id');
	});

	it('should be invalid if accountType is not one of the enum values', () => {
		const feetype = new Feetype({
			feeType: 'Registration Fee',
			description: 'Registration fee for new students',
			accountType: 'Invalid',
			categoryId: mongoose.Types.ObjectId(),
			schoolId: mongoose.Types.ObjectId(),
		});

		const error = feetype.validateSync();
		expect(error.errors.accountType.message).toEqual(
			'`Invalid` is not a valid enum value for path `accountType`.'
		);
	});

	it('should be valid if all fields are provided', () => {
		const feetype = new Feetype({
			feeType: 'Registration Fee',
			description: 'Registration fee for new students',
			accountType: 'Revenue',
			schoolId: mongoose.Types.ObjectId(),
			categoryId: '5f8c6c5e0e0a8c0a1c8f1b2a',
		});

		const error = feetype.validateSync();
		expect(error).toBeUndefined();
	});
});
