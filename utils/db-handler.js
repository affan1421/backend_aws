// /* eslint-disable guard-for-in */
// const mongoose = require('mongoose');
// const { MongoMemoryServer } = require('mongodb-memory-server');

// let mongod = null;

// mongod = new MongoMemoryServer();
// const connectDatabase = async () => {
// 	try {
// 		const uri = await mongod.getUri();
// 		const mongooseOpts = {
// 			useNewUrlParser: true,
// 			useUnifiedTopology: true,
// 		};
// 		await mongoose.connect(uri, mongooseOpts);
// 		console.log('Database Connected');
// 	} catch (error) {
// 		console.error('Failed to connect to the database:', error);
// 	}
// };

// const closeDatabase = async () => {
// 	await mongoose.connection.dropDatabase();
// 	await mongoose.connection.close();
// 	await mongod.stop();
// };

// module.exports = {
// 	connectDatabase,
// 	closeDatabase,
// };
