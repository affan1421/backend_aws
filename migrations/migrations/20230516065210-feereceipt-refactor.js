module.exports = {
	async up(db, client) {
		// find all receipts without section object and receiptType is ACADEMIC/MISCELLANEOUS.
		// extract studentId and find the section Id from student collection.
		// replace the classname to only classname without section name.
		// make the section object with sectionId and name.
		// update the receipt with sectionId and name.

		const receipts = await db
			.collection('feereceipts')
			.find({
				'student.section': { $exists: false },
				receiptType: { $in: ['ACADEMIC', 'MISCELLANEOUS'] },
			})
			.toArray();
		console.log(receipts.length);

		const operations = receipts.map(async receipt => {
			const { studentId } = receipt.student;
			const { classId, name } = receipt.student.class;
			const className = name.split(' - ')[0];
			const sectionName = name.split(' - ')[1];
			console.log(receipt._id, className, sectionName);
			const studInfo = await db
				.collection('students')
				.findOne({ _id: studentId }, { section: 1 });
			const section = {
				name: sectionName,
				sectionId: studInfo.section,
			};
			const classObj = {
				name: className,
				classId,
			};
			const updateReceipt = await db.collection('feereceipts').updateOne(
				{ _id: receipt._id },
				{
					$set: {
						'student.section': section,
						'student.class': classObj,
					},
				}
			);
			console.log(updateReceipt.modifiedCount);

			return updateReceipt;
		});
		await Promise.all(operations);
	},

	async down(db, client) {
		await Promise.resolve('do nothing');
	},
};
