/* eslint-disable no-undef */
const ErrorResponse = require('../../utils/errorResponse');

describe('ErrorResponse', () => {
	it('should create an error response with the provided message and status code', () => {
		const message = 'Invalid request body';
		const statusCode = 400;
		const errorResponse = new ErrorResponse(message, statusCode);
		expect(errorResponse.message).toBe(message);
		expect(errorResponse.statusCode).toBe(statusCode);
	});
});
