/* eslint-disable no-undef */
const catchAsync = require('../../utils/catchAsync');

describe('catchAsync', () => {
	it('should call next with an error if fn throws an error', async () => {
		const error = new Error('Something went wrong');
		const fn = jest.fn().mockRejectedValueOnce(error);
		const req = {};
		const res = {};
		const next = jest.fn();
		await catchAsync(fn)(req, res, next);
		expect(next).toHaveBeenCalledWith(error);
	});

	it('should call fn with req, res, and next', async () => {
		const fn = jest.fn().mockResolvedValueOnce();
		const req = {};
		const res = {};
		const next = jest.fn();
		await catchAsync(fn)(req, res, next);
		expect(fn).toHaveBeenCalledWith(req, res, next);
	});
});
