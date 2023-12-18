const { default: mongoose } = require('mongoose');

module.exports = {
	async up(db) {
		// Find all fee types
		const feeTypes = await db.collection('feetypes').find({}).toArray();
		let appCount = 0;
		let miscCount = 0;
		let prevCount = 0;
		let academicCount = 0;

		const operations = feeTypes.map(feeType => {
			const { _id, isMisc, feeType: typeName } = feeType;
			let feeCategory;

			if (isMisc) {
				if (typeName.match(/Application Fee/)) {
					feeCategory = 'APPLICATION';
					appCount += 1;
				} else {
					feeCategory = 'MISCELLANEOUS';
					miscCount += 1;
				}
			} else if (typeName.match(/Prev/)) {
				feeCategory = 'PREVIOUS';
				prevCount += 1;
			} else {
				feeCategory = 'ACADEMIC';
				academicCount += 1;
			}

			return db
				.collection('feetypes')
				.updateOne(
					{ _id: mongoose.Types.ObjectId(_id) },
					{ $set: { feeCategory } }
				);
		});

		console.log(
			`Application Fees: ${appCount}\nMiscellaneous Fees: ${miscCount}\nPrevious Fees: ${prevCount}\nAcademic Fees: ${academicCount}`
		);

		return Promise.all(operations);
	},

	async down(db) {
		const operation = db
			.collection('feetypes')
			.updateMany({}, { $unset: { feeCategory: '' } });
		return Promise.resolve(operation);
	},
};
