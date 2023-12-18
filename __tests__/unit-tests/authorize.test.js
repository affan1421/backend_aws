/* eslint-disable no-multi-assign */
/* eslint-disable no-undef */
const jwt = require('jsonwebtoken');
const axios = require('axios');
const mongoose = require('mongoose');
const { authenticateUser, cache } = require('../../middleware/authorize');
const ErrorResponse = require('../../utils/errorResponse');

const Users = {
	find: jest.fn().mockReturnThis(),
	limit: jest.fn().mockReturnThis(),
	toArray: jest.fn().mockResolvedValue([{ name: 'John Doe' }]),
	// Replace the findOne property with a mock implementation
	findOne: jest.fn().mockResolvedValue({
		data: { name: 'John Doe', email: 'johndoe@gmail.com' },
	}),
};

jest.mock('axios'); // mock axios module
jest.mock('jsonwebtoken'); // mock jsonwebtoken module
jest.mock('../../utils/errorResponse');
jest.mock('mongoose');

// Mock the mongoose module and its connection object
jest.mock('mongoose', () => ({
	connect: jest.fn(() => Promise.resolve()),
	connection: {
		db: {
			collection: jest.fn(() => ({
				find: jest.fn().mockReturnThis(),
				limit: jest.fn().mockReturnThis(),
				toArray: jest.fn().mockResolvedValue([{ name: 'John Doe' }]),
			})),
		},
	},
	Types: {
		ObjectId: jest.fn(() => ({
			toString: jest.fn(() => 'valid_user_id'),
		})),
	},
}));

const mockRequest = () => ({
	Headers: {},
	params: {},
	body: {},
});

const mockResponse = () => ({
	status: jest.fn().mockReturnThis(),
	json: jest.fn().mockReturnThis(),
});
const mockNext = jest.fn();

describe('authenticateUser middleware', () => {
	beforeEach(() => {
		jest.clearAllMocks(); // clear mock function calls before each test
	});

	it('should return 401 error if Authorization header is missing', async () => {
		const req = (mockRequest().Headers = {
			headers: {},
		});
		const res = mockResponse();
		await authenticateUser(req, res, mockNext);
		expect(mockNext).toHaveBeenCalled();
		expect(ErrorResponse).toHaveBeenCalledWith('Unauthorized Access', 401);
	});

	it('should return 401 error if token is not in Bearer format', async () => {
		const req = (mockRequest().Headers = {
			headers: {
				authorization: 'invalid_token',
			},
		});
		const res = mockResponse();
		await authenticateUser(req, res, mockNext);
		expect(mockNext).toHaveBeenCalled();
		expect(ErrorResponse).toHaveBeenCalledWith('Unauthorized Access', 401);
	});

	it('should return 401 error if token is invalid', async () => {
		const req = (mockRequest().Headers = {
			headers: { authorization: 'Bearer invalid_token' },
		});
		const res = mockResponse();
		jest.spyOn(jwt, 'verify').mockResolvedValueOnce(null);
		await authenticateUser(req, res, mockNext);
		expect(mockNext).toHaveBeenCalled();
		expect(ErrorResponse).toHaveBeenCalledWith('Invalid Token', 401);
	});

	// it('should return 401 error if user is not found', async () => {
	// 	const req = (mockRequest().Headers = {
	// 		headers: {
	// 			authorization: 'Bearer valid_token',
	// 		},
	// 	});
	// 	const res = mockResponse();
	// 	jest.spyOn(jwt, 'verify').mockResolvedValueOnce({ id: 'valid_user_id' });
	// 	jest.spyOn(axios, 'get').mockResolvedValueOnce({ data: null });
	// 	await authenticateUser(req, res, mockNext);
	// 	expect(mockNext).toHaveBeenCalled();
	// 	expect(ErrorResponse).toHaveBeenCalledWith('Unauthorized Access', 401);
	// });

	// it('should attach user to the request object and cache the user', async () => {
	// 	const req = (mockRequest().Headers = {
	// 		headers: {
	// 			authorization: 'Bearer valid_token',
	// 		},
	// 	});
	// 	const res = mockResponse();
	// 	jest.spyOn(jwt, 'verify').mockResolvedValueOnce({ id: 'valid_user_id' });
	// 	jest.spyOn(Users, 'findOne').mockResolvedValue({
	// 		data: { name: 'John Doe', email: 'johndoe@gmail.com' },
	// 	});
	// 	await authenticateUser(req, res, mockNext);
	// 	expect(cache.get('valid_user_id')).toEqual({
	// 		name: 'John Doe',
	// 		email: 'johndoe@gmail.com',
	// 	});
	// 	expect(mockNext).toHaveBeenCalled();
	// });
	// it('should use cached user if available', async () => {
	// 	const req = (mockRequest().Headers = {
	// 		headers: { authorization: 'Bearer valid_token' },
	// 	});
	// 	const res = mockResponse();
	// 	jest.spyOn(jwt, 'verify').mockResolvedValueOnce({ id: 'valid_user_id' });
	// 	axios.get.mockResolvedValue({
	// 		data: { name: 'John Doe', email: 'johndoe@example.com' },
	// 	});
	// 	await authenticateUser(req, res, mockNext);
	// 	expect(axios.get).not.toHaveBeenCalled();
	// 	expect(mockNext).toHaveBeenCalledTimes(1);
	// });
});
