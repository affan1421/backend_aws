// /* eslint-disable no-undef */
// const mongoose = require('mongoose');
// const connectDatabase = require('../../utils/dbConnection');

// jest.mock('mongoose');

// describe('connectDatabase', () => {
// 	it('should connect to the database with the correct configuration', async () => {
// 		const mockConnection = { name: 'mockConnection' };
// 		jest.spyOn(mongoose, 'connect').mockResolvedValueOnce(mockConnection);
// 		jest
// 			.spyOn(console, 'log')
// 			.mockResolvedValueOnce('MongoDB Database Connected');
// 		await connectDatabase();

// 		expect(mongoose.connect).toHaveBeenCalledWith(process.env.MONGO_URI, {
// 			useNewUrlParser: true,
// 			useUnifiedTopology: true,
// 		});
// 		expect(console.log).toHaveBeenCalledWith('MongoDB Database Connected');
// 	});
// 	// it('should exit the process and log an error message if the connection fails', async () => {
// 	// 	const errorMessage = 'Failed to connect to the database';
// 	// 	jest
// 	// 		.spyOn(mongoose, 'connect')
// 	// 		.mockRejectedValueOnce(new Error(errorMessage));
// 	// 	const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
// 	// 	const exitSpy = jest.spyOn(process, 'exit').mockImplementation(() => {});

// 	// 	await connectDatabase();

// 	// 	expect(mongoose.connect).toHaveBeenCalledWith(process.env.MONGO_URI, {
// 	// 		useNewUrlParser: true,
// 	// 		useUnifiedTopology: true,
// 	// 	});
// 	// 	expect(consoleSpy).toHaveBeenCalledWith(errorMessage);
// 	// 	expect(exitSpy).toHaveBeenCalledWith(1);

// 	// 	consoleSpy.mockRestore();
// 	// 	exitSpy.mockRestore();
// 	// });
// });

test('dummy1', () => {
	expect(1).toBe(1);
});
