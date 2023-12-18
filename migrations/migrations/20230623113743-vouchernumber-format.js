const moment = require('moment');

module.exports = {
	async up(db, client) {
		const expenses = await db.collection('expenses').find({}).toArray();

		const operations = expenses.map(expense => {
			const { expenseDate, voucherNumber } = expense;
			const voucherNumberDate = voucherNumber.substring(2, 8);
			console.log('viu', voucherNumberDate);
			console.log('ci', voucherNumber);
			const ActualExpenseDateVoucher = moment(voucherNumberDate, 'DDMMYY')
				.add(1, 'days')
				.format('DDMMYY');

			// format as 2023-06-21T00:00:00.000Z
			const ActualExpenseDate = moment(
				ActualExpenseDateVoucher,
				'DDMMYY'
			).format('YYYY-MM-DD[T]HH:mm:ss.SSS[Z]');

			// replace the 2nd to 8th with the ActualExpenseDate
			const voucherNumberFinal = voucherNumber.replace(
				voucherNumber.substring(2, 8),
				ActualExpenseDateVoucher
			);

			console.log(voucherNumber, voucherNumberFinal, ActualExpenseDate);

			return db.collection('expenses').updateOne(
				{
					_id: expense._id,
				},
				{
					$set: {
						voucherNumber: voucherNumberFinal,
						expenseDate: ActualExpenseDate,
					},
				}
			);
		});

		return Promise.all(operations);
	},

	async down(db, client) {
		return Promise.resolve('ok');
	},
};
