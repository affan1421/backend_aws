/* eslint-disable no-undef */
const AcademicYear = require('../../models/academicYear');

describe('AcademicYear', () => {
	test('fails validation with missing required fields', () => {
		const academicYear = new AcademicYear();
		const error = academicYear.validateSync();
		expect(error.errors).toHaveProperty('name');
		expect(error.errors).toHaveProperty('startDate');
		expect(error.errors).toHaveProperty('endDate');
		expect(error.errors).toHaveProperty('schoolId');
	});
	test('passes validation with valid data', () => {
		const academicYear = new AcademicYear({
			name: '2023-2024',
			startDate: new Date('2023-05-01T00:00:00.000Z'),
			endDate: new Date('2024-05-01T00:00:00.000Z'),
			months: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
			schoolId: '60a1b0b0b8b5f0b0b8b5f0b0',
		});
		const error = academicYear.validateSync();
		expect(error).toBeUndefined();
		expect(academicYear).toHaveProperty('isActive', true);
	});
	test('fails validation with invalid date', () => {
		const academicYear = new AcademicYear({
			name: '2023-2024',
			startDate: 'invalid',
			endDate: 'invalid',
			months: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
			schoolId: '60a1b0b0b8b5f0b0b8b5f0b0',
		});
		const error = academicYear.validateSync();
		expect(error.errors).toHaveProperty('startDate');
		expect(error.errors).toHaveProperty('endDate');
	});
});
