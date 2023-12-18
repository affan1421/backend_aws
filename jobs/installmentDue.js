const cron = require('node-cron');
const fs = require('fs');
const FeeInstallment = require('../models/feeInstallment');

// Update the status of Fee Installment every 24 hours at 12:00 AM.
cron.schedule('0 0 * * *', async () => {
	const today = new Date();
	const feeInstallments = await FeeInstallment.find({
		date: {
			$lt: today,
		},
		status: 'Upcoming',
	});

	const promises = feeInstallments.map(async feeInstallment => {
		feeInstallment.status = 'Due';
		await feeInstallment.save();
	});

	await Promise.allSettled(promises);

	const rejectedPromises = promises.filter(p => p.status === 'rejected');

	if (rejectedPromises.length > 0) {
		console.error(
			`Error while updating Fee Installment status: ${rejectedPromises[0].reason.message}`
		);
	}

	const log = fs.createWriteStream('log.txt', { flags: 'a' });
	log.write(
		`\n${new Date().toISOString()}: ${feeInstallments.length} records updated`
	);
	log.write(
		`\n${new Date().toISOString()}: ${rejectedPromises.length} records failed`
	);
	log.end();
});
