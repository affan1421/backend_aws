/* eslint-disable no-undef */
const mongoose = require('mongoose');
const FeeSchedule = require('../../models/feeSchedule');

describe('FeeSchedule Model', () => {
	it('should be invalid if required fields are empty', () => {
		const feeSchedule = new FeeSchedule();

		const error = feeSchedule.validateSync();
		expect(error.errors.scheduleName.message).toEqual(
			'Please add a schedule name'
		);
		expect(error.errors.day.message).toEqual('Please add a day');
		expect(error.errors.schoolId.message).toEqual('Please add a school id');
	});

	it('should be valid if all required fields are provided', () => {
		const feeSchedule = new FeeSchedule({
			scheduleName: 'Tuition Fees',
			description: 'Tuition fees for the academic year',
			day: 1,
			months: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
			categoryId: '5f8c6c5e0e0a8c0a1c8f1b2a',

			schoolId: mongoose.Types.ObjectId(),
			scheduledDates: [
				new Date('2023-04-01'),
				new Date('2023-05-01'),
				new Date('2023-06-01'),
			],
		});

		const error = feeSchedule.validateSync();
		expect(error).toBeUndefined();
	});

	it('should be valid if description field is missing', () => {
		const feeSchedule = new FeeSchedule({
			scheduleName: 'Tuition Fees',
			day: 1,
			categoryId: '5f8c6c5e0e0a8c0a1c8f1b2a',

			months: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
			schoolId: mongoose.Types.ObjectId(),
			scheduledDates: [
				new Date('2023-04-01'),
				new Date('2023-05-01'),
				new Date('2023-06-01'),
			],
		});

		const error = feeSchedule.validateSync();
		expect(error).toBeUndefined();
	});

	it('should be valid if scheduledDates field is missing', () => {
		const feeSchedule = new FeeSchedule({
			scheduleName: 'Tuition Fees',
			categoryId: '5f8c6c5e0e0a8c0a1c8f1b2a',

			description: 'Tuition fees for the academic year',
			day: 1,
			months: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
			schoolId: mongoose.Types.ObjectId(),
		});

		const error = feeSchedule.validateSync();
		expect(error).toBeUndefined();
	});
});
