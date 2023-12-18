/* eslint-disable no-undef */
const SuccessResponse = require('../../utils/successResponse');

describe('SuccessResponse', () => {
	it('returns an object with the correct properties and values', () => {
		const data = { foo: 'bar' };
		const resultCount = 1;
		const message = 'Success';

		const response = SuccessResponse(data, resultCount, message);

		expect(response.success).toBe(true);
		expect(response.data).toBe(data);
		expect(response.resultCount).toBe(resultCount);
		expect(response.message).toBe(message);
	});
});
