module.exports = {
	async up(db, client) {
		// Application fee receipt script
		// 1. find all receipts WITH receiptType is APPLICATION.
		// 2. extract class oibject and make the class name out of it and section name find the classId from the section Id.
		// 3. update the receipt with class obj and section obj.
		const receipts = await db
			.collection('feereceipts')
			.find(
				{
					receiptType: 'APPLICATION',
				},
				{ student: 1 }
			)
			.toArray();
		console.log(receipts.length);
		const operations = receipts.map(async receipt => {
			const { classId, name } = receipt.student.class;
			const className = name.split(' - ')[0];
			const sectionName = name.split(' - ')[1];
			console.log(receipt._id, className, sectionName);
			const classInfo = await db
				.collection('sections')
				.findOne({ _id: classId }, { class_id: 1 });
			const classObj = {
				name: className,
				classId: classInfo.class_id,
			};
			const section = {
				name: sectionName,
				sectionId: classId,
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
