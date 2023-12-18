/* eslint-disable no-multi-assign */
/* eslint-disable no-undef */
const FeeSchedule = require('../../models/feeSchedule');
const {
	create,
	getAll,
	getFeeSchedule,
	update,
	deleteFeeSchedule,
} = require('../../controller/feeSchedule');
const ErrorResponse = require('../../utils/errorResponse');
const SuccessResponse = require('../../utils/successResponse');

jest.mock('../../models/feeSchedule');
jest.mock('../../utils/errorResponse');
jest.mock('../../utils/successResponse');

beforeAll(() => {
	jest.clearAllMocks();
});

const mockRequest = () => ({
	body: {},
	params: {},
	query: {},
});

const mockResponse = () => ({
	status: jest.fn().mockReturnThis(),
	json: jest.fn().mockReturnThis(),
});

const mockNext = jest.fn();

describe('Fee Schedule Controller', () => {
	describe('Create Fee Schedule', () => {
		// all required fields are provided 422
		it('should return 422 if all required fields are not provided', async () => {
			const req = (mockRequest().body = {
				body: {
					scheduleName: 'Test Schedule',
					// schoolId: '5f9f1b9b9c9d440000a1b0f1',
				},
			});
			const res = mockResponse();
			await create(req, res, mockNext);
			expect(mockNext).toHaveBeenCalled();
			expect(ErrorResponse).toHaveBeenCalledWith(
				'Please Provide All Required Fields',
				422
			);
		});
		// fee schedule already exists 400
		it('should return 400 if fee schedule already exists', async () => {
			const req = (mockRequest().body = {
				body: {
					scheduleName: 'Test Schedule',
					day: 1,
					months: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
					existMonths: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
					schoolId: '5f9f1b9b9c9d440000a1b0f1',
					categoryId: '5f8c6c5e0e0a8c0a1c8f1b2a',
				},
			});
			const res = mockResponse();
			jest.spyOn(FeeSchedule, 'findOne').mockResolvedValueOnce(true);
			await create(req, res, mockNext);
			expect(mockNext).toHaveBeenCalled();
			expect(ErrorResponse).toHaveBeenCalledWith(
				'Fee Schedule Already Exists',
				400
			);
		});
		// fee schedule created successfully 201
		it('should return 201 if fee schedule created successfully', async () => {
			const req = (mockRequest().body = {
				body: {
					scheduleName: 'new monthly',
					description: 'Monthly fee schedule',
					day: 9,
					existMonths: [7, 8, 9, 10, 11, 12, 1, 2, 3, 4],
					categoryId: '5f8c6c5e0e0a8c0a1c8f1b2a',

					months: [1, 11, 12, 2, 4, 9],
					schoolId: '5f9f1b0b0b1b9c0b8c8b8b8b',
				},
			});
			const res = mockResponse();
			jest.spyOn(FeeSchedule, 'create').mockResolvedValue({
				scheduleName: 'new monthly',
				description: 'Monthly fee schedule',
				day: 9,
				months: [9, 11, 12, 1, 2, 4],
				schoolId: '5f9f1b0b0b1b9c0b8c8b8b8b',
				scheduledDates: [
					'2023-09-08T18:30:00.000Z',
					'2023-11-08T18:30:00.000Z',
					'2023-12-08T18:30:00.000Z',
					'2024-01-08T18:30:00.000Z',
					'2024-02-08T18:30:00.000Z',
					'2024-04-08T18:30:00.000Z',
				],
				categoryId: '5f8c6c5e0e0a8c0a1c8f1b2a',

				_id: '6426799d714d49a034f79dd5',
				createdAt: '2023-03-31T06:11:41.387Z',
				updatedAt: '2023-03-31T06:11:41.387Z',
				__v: 0,
			});
			await create(req, res, mockNext);
			expect(res.status).toHaveBeenCalledWith(201);
			expect(SuccessResponse).toHaveBeenCalledWith(
				{
					scheduleName: 'new monthly',
					description: 'Monthly fee schedule',
					day: 9,
					months: [9, 11, 12, 1, 2, 4],
					schoolId: '5f9f1b0b0b1b9c0b8c8b8b8b',
					scheduledDates: [
						'2023-09-08T18:30:00.000Z',
						'2023-11-08T18:30:00.000Z',
						'2023-12-08T18:30:00.000Z',
						'2024-01-08T18:30:00.000Z',
						'2024-02-08T18:30:00.000Z',
						'2024-04-08T18:30:00.000Z',
					],
					categoryId: '5f8c6c5e0e0a8c0a1c8f1b2a',

					_id: '6426799d714d49a034f79dd5',
					createdAt: '2023-03-31T06:11:41.387Z',
					updatedAt: '2023-03-31T06:11:41.387Z',
					__v: 0,
				},
				1,
				'Created Successfully'
			);
		});
	});
	describe('Get All Fee Schedules', () => {
		// no fee schedules found 404
		it('should return 404 if no fee schedules found', async () => {
			const req = (mockRequest().query = {
				query: {
					schoolId: '5f9f1b9b9c9d440000a1b0f1',
					scheduleType: 'Monthly',
					page: 0,
					limit: 10,
				},
			});
			const res = mockResponse();
			jest.spyOn(FeeSchedule, 'aggregate').mockResolvedValueOnce([
				{
					data: [],
					docCount: {
						length: 0,
					},
				},
			]);
			await getAll(req, res, mockNext);
			expect(mockNext).toHaveBeenCalled();
			expect(ErrorResponse).toHaveBeenCalledWith(
				'Fee Schedules Not Found',
				404
			);
		});
		// get all fee schedules successfully 200
		it('should return 200 if get all fee schedules successfully', async () => {
			const req = (mockRequest().query = {
				query: {
					schoolId: '5f9f1b9b9c9d440000a1b0f1',
					scheduleType: 'Monthly',
					page: 0,
					limit: 10,
				},
			});
			const res = mockResponse();
			const mockData = [
				{
					docCount: [{ count: 2 }],
					data: [
						{
							scheduleName: 'Test Schedule',
							scheduleType: 'Monthly',
							startDate: '2023-04-30T18:30:00.000Z',
							endDate: '2024-03-29T18:30:00.000Z',
							schoolId: '5f9f1b9b9c9d440000a1b0f1',
							scheduleDates: [
								'2023-04-30T18:30:00.000Z',
								'2023-09-30T18:30:00.000Z',
								'2024-02-29T18:30:00.000Z',
							],
							interval: 5,
							createdAt: '2020-11-03T18:30:00.000Z',
							updatedAt: '2020-11-03T18:30:00.000Z',
						},
						{
							scheduleName: 'Test Schedule',
							scheduleType: 'Monthly',
							startDate: '2023-04-30T18:30:00.000Z',
							endDate: '2024-03-29T18:30:00.000Z',
							schoolId: '5f9f1b9b9c9d440000a1b0f1',
							scheduleDates: [
								'2023-04-30T18:30:00.000Z',
								'2023-09-30T18:30:00.000Z',
								'2024-02-29T18:30:00.000Z',
							],
							interval: 5,
							createdAt: '2020-11-03T18:30:00.000Z',
							updatedAt: '2020-11-03T18:30:00.000Z',
						},
					],
				},
			];
			jest.spyOn(FeeSchedule, 'aggregate').mockResolvedValueOnce(mockData);
			await getAll(req, res, mockNext);
			expect(res.status).toHaveBeenCalledWith(200);
			expect(SuccessResponse).toHaveBeenCalledWith(
				[
					{
						scheduleName: 'Test Schedule',
						scheduleType: 'Monthly',
						startDate: '2023-04-30T18:30:00.000Z',
						endDate: '2024-03-29T18:30:00.000Z',
						schoolId: '5f9f1b9b9c9d440000a1b0f1',
						scheduleDates: [
							'2023-04-30T18:30:00.000Z',
							'2023-09-30T18:30:00.000Z',
							'2024-02-29T18:30:00.000Z',
						],
						interval: 5,
						createdAt: '2020-11-03T18:30:00.000Z',
						updatedAt: '2020-11-03T18:30:00.000Z',
					},
					{
						scheduleName: 'Test Schedule',
						scheduleType: 'Monthly',
						startDate: '2023-04-30T18:30:00.000Z',
						endDate: '2024-03-29T18:30:00.000Z',
						schoolId: '5f9f1b9b9c9d440000a1b0f1',
						scheduleDates: [
							'2023-04-30T18:30:00.000Z',
							'2023-09-30T18:30:00.000Z',
							'2024-02-29T18:30:00.000Z',
						],
						interval: 5,
						createdAt: '2020-11-03T18:30:00.000Z',
						updatedAt: '2020-11-03T18:30:00.000Z',
					},
				],
				2,
				'Fetched Successfully'
			);
		});
	});
	describe('Get Fee Schedule By Id', () => {
		// fee schedule not found 404
		it('should return 404 if fee schedule not found', async () => {
			const req = (mockRequest().body = {
				params: {
					id: '5f9f1b9b9c9d440000a1b0f1',
				},
				user: {
					school_id: { _id: '5f5f5f5f5f5f5f5f5f5f5f5f' },
				},
			});
			const res = mockResponse();
			jest.spyOn(FeeSchedule, 'findOne').mockResolvedValueOnce(null);
			await getFeeSchedule(req, res, mockNext);
			expect(mockNext).toHaveBeenCalled();
			expect(ErrorResponse).toHaveBeenCalledWith('Fee Schedule Not Found', 404);
		});
		// get fee schedule by id successfully 200
		it('should return 200 if get fee schedule by id successfully', async () => {
			const req = (mockRequest().body = {
				params: {
					id: '5f9f1b9b9c9d440000a1b0f1',
				},
				user: {
					school_id: { _id: '5f5f5f5f5f5f5f5f5f5f5f5f' },
				},
			});
			const res = mockResponse();
			const mockFeeSchedule = {
				scheduleName: 'Test Schedule',
				scheduleType: 'Monthly',
				startDate: '2023-04-30T18:30:00.000Z',
				endDate: '2024-03-29T18:30:00.000Z',
				schoolId: '5f9f1b9b9c9d440000a1b0f1',
				scheduleDates: [
					'2023-04-30T18:30:00.000Z',
					'2023-09-30T18:30:00.000Z',
					'2024-02-29T18:30:00.000Z',
				],
				interval: 5,
				createdAt: '2020-11-03T18:30:00.000Z',
				updatedAt: '2020-11-03T18:30:00.000Z',
			};
			jest.spyOn(FeeSchedule, 'findOne').mockResolvedValueOnce(mockFeeSchedule);
			await getFeeSchedule(req, res, mockNext);
			expect(res.status).toHaveBeenCalledWith(200);
			expect(SuccessResponse).toHaveBeenCalledWith(
				mockFeeSchedule,
				1,
				'Fetched Successfully'
			);
		});
	});
	describe('Update Fee Schedule', () => {
		// fee schedule not found 404
		it('should return 404 if fee schedule not found', async () => {
			const req = (mockRequest().body = {
				params: {
					id: '5f9f1b9b9c9d440000a1b0f1',
				},
				body: {
					scheduleName: 'Test Schedule',
					scheduleType: 'Monthly',
					startDate: 'Mon May 01 2023 00:00:00 GMT+0530 (India Standard Time)',
					endDate: 'Sat Mar 30 2024 00:00:00 GMT+0530 (India Standard Time)',
					schoolId: '5f9f1b9b9c9d440000a1b0f1',
					interval: 5,
				},
			});
			const res = mockResponse();
			jest.spyOn(FeeSchedule, 'findOne').mockImplementationOnce(() => ({
				lean: jest.fn().mockResolvedValueOnce(null),
			}));
			await update(req, res, mockNext);
			expect(mockNext).toHaveBeenCalled();
			expect(ErrorResponse).toHaveBeenCalledWith('Fee Schedule Not Found', 404);
		});
		// update fee schedule successfully 200
		it('should return 200 if update fee schedule successfully', async () => {
			const req = (mockRequest().body = {
				params: {
					id: '5f9f1b9b9c9d440000a1b0f1',
				},
				body: {
					scheduleName: 'new monthly',
					description: 'Monthly fee schedule',
					day: 9,
					existMonths: [7, 8, 9, 10, 11, 12, 1, 2, 3, 4],
					months: [1, 11, 12, 2, 4, 9],
					schoolId: '5f9f1b0b0b1b9c0b8c8b8b8b',
				},
			});
			const res = mockResponse();
			const mockFeeSchedule = {
				scheduleName: 'Test Schedule',
				scheduleType: 'Monthly',
				startDate: new Date('2023-04-30T18:30:00.000Z'),
				endDate: new Date('2024-03-29T18:30:00.000Z'),
				schoolId: '5f9f1b9b9c9d440000a1b0f1',
				scheduleDates: [
					'2023-04-30T18:30:00.000Z',
					'2023-09-30T18:30:00.000Z',
					'2024-02-29T18:30:00.000Z',
				],
				interval: 5,
				createdAt: '2020-11-03T18:30:00.000Z',
				updatedAt: '2020-11-03T18:30:00.000Z',
			};
			jest.spyOn(FeeSchedule, 'findOne').mockImplementationOnce(() => ({
				lean: jest.fn().mockResolvedValueOnce(mockFeeSchedule),
			}));
			jest
				.spyOn(FeeSchedule, 'findOneAndUpdate')
				.mockResolvedValueOnce(mockFeeSchedule);
			await update(req, res, mockNext);
			expect(res.status).toHaveBeenCalledWith(200);
			expect(SuccessResponse).toHaveBeenCalledWith(
				mockFeeSchedule,
				1,
				'Updated Successfully'
			);
		});
	});
	describe('Delete Fee Schedule', () => {
		// fee schedule not found 404
		it('should return 404 if fee schedule not found', async () => {
			const req = (mockRequest().body = {
				params: {
					id: '5f9f1b9b9c9d440000a1b0f1',
				},
				user: {
					school_id: { _id: '5f5f5f5f5f5f5f5f5f5f5f5f' },
				},
			});
			const res = mockResponse();
			jest.spyOn(FeeSchedule, 'findOneAndDelete').mockResolvedValueOnce(null);
			await deleteFeeSchedule(req, res, mockNext);
			expect(mockNext).toHaveBeenCalled();
			expect(ErrorResponse).toHaveBeenCalledWith('Fee Schedule Not Found', 404);
		});
		// delete fee schedule successfully 200
		it('should return 200 if delete fee schedule successfully', async () => {
			const req = (mockRequest().body = {
				params: {
					id: '5f9f1b9b9c9d440000a1b0f1',
				},
				user: {
					school_id: { _id: '5f5f5f5f5f5f5f5f5f5f5f5f' },
				},
			});
			const res = mockResponse();
			jest.spyOn(FeeSchedule, 'findOneAndDelete').mockResolvedValueOnce(true);
			await deleteFeeSchedule(req, res, mockNext);
			expect(res.status).toHaveBeenCalledWith(200);
			expect(SuccessResponse).toHaveBeenCalledWith(
				null,
				1,
				'Deleted Successfully'
			);
		});
	});
});
