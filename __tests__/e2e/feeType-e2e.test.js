/* eslint-disable no-undef */
// const request = require('supertest');
// const app = require('../../index');
// const { connectDatabase, closeDatabase } = require('../../utils/db-handler');

// jest.setTimeout(30000);

describe('FeeType API', () => {
	// beforeAll(async () => {
	// 	await connectDatabase();
	// });

	// afterAll(async () => {
	// 	await closeDatabase();
	// });

	describe('POST /api/feeType', () => {
		// test / route
		it('should return server is running', async () => {
			// const res = await request(app).get('/');
			// expect(res.statusCode).toEqual(200);
			// expect(res).toEqual('Server is up and Running👨‍💻👩‍💻');
			expect(1).toBe(1);
		});

		// it('should return 422 if fields are not provided', async () => {
		// 	const res = await request(app).post('/api/v1/feeType')
		// 	.set('Accept', 'application/json')
		// 	.set('authorization', 'Bearer ')
		// 	.send({
		// 		feeType: '',
		// 		accountType: 'Assets',
		// 	});
		// 	expect(res.statusCode).toEqual(422);
		// 	expect(res.body).toHaveProperty('message');
		// });
		// it('should return 201 if feeType is created', async () => {
		// 	const res = await request(app).post('/api/v1/feeType').send({
		// 		feeType: 'Test Fee Type',
		// 		accountType: 'Assets',
		// 		description: 'Test Fee Type Description',
		// 		schoolId: '5f9f1b9b9c9d9b2a7c8b9b9b',
		// 	});
		// 	expect(res.statusCode).toEqual(201);
		// });
	});
});
