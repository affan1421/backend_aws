const SuccessResponse = (data = null, resultCount, message = 'Success') => ({
	success: true,
	data,
	resultCount,
	message,
});

module.exports = SuccessResponse;
