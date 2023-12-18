/* eslint-disable no-undef */
const mongoose = require('mongoose');
const FeeStructure = require('../../models/feeStructure');

describe('Fee Structure Model', () => {
	test('should be invalid if feeStructureName is empty', () => {
		const feeStructure = new FeeStructure({
			academicYear: '2023-2024',
			schoolId: mongoose.Types.ObjectId(),
			classes: [
				{
					name: 'Class 1',
					sectionId: mongoose.Types.ObjectId(),
				},
			],
			description: 'Some description',
			feeDetails: [],
			totalAmount: 1000,
		});
		const errors = feeStructure.validateSync();
		expect(errors.errors.feeStructureName).toBeDefined();
	});

	test('should be invalid if schoolId is empty', () => {
		const feeStructure = new FeeStructure({
			feeStructureName: 'Some Fee Structure',
			academicYear: '2023-2024',
			classes: [
				{
					name: 'Class 1',
					sectionId: mongoose.Types.ObjectId(),
				},
			],
			description: 'Some description',
			feeDetails: [],
			totalAmount: 1000,
		});
		const errors = feeStructure.validateSync();

		expect(errors.errors.schoolId).toBeDefined();
	});

	test('should be invalid if totalAmount is empty', () => {
		const feeStructure = new FeeStructure({
			feeStructureName: 'Some Fee Structure',
			academicYear: '2023-2024',
			schoolId: mongoose.Types.ObjectId(),
			classes: [
				{
					name: 'Class 1',
					sectionId: mongoose.Types.ObjectId(),
				},
			],
			description: 'Some description',
			feeDetails: [],
		});
		const errors = feeStructure.validateSync();

		expect(errors.errors.totalAmount.message).toEqual(
			'Total Amount is Mandatory'
		);
	});

	test('should be valid if all required fields are provided', () => {
		const feeStructure = new FeeStructure({
			feeStructureName: 'Some Fee Structure',
			academicYear: '2023-2024',
			schoolId: mongoose.Types.ObjectId(),
			categoryId: '5f8c6c5e0e0a8c0a1c8f1b2a',

			classes: [
				{
					name: 'Class 1',
					sectionId: mongoose.Types.ObjectId(),
				},
			],
			description: 'Some description',
			feeDetails: [],
			totalAmount: 1000,
		});
		const errors = feeStructure.validateSync();

		expect(errors).toEqual(undefined);
	});
});
