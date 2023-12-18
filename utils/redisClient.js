const { createClient } = require('redis');

const {
	REDIS_SERVER_HOST,
	REDIS_SERVER_PORT,
	REDIS_SERVER_USERNAME,
	REDIS_SERVER_PASSWORD,
} = process.env;

const client = createClient({
	host: REDIS_SERVER_HOST,
	port: REDIS_SERVER_PORT,
	username: REDIS_SERVER_USERNAME,
	password: REDIS_SERVER_PASSWORD,
});

client
	.connect()
	.then(() => console.log('Redis server is up and running'))
	.catch(err => console.log('Redis Error', err));

module.exports = client;
