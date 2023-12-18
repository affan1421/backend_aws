const mongoose = require('mongoose');

// New previous academic year mapping (2022-2023).
// If the length of receipt.items is 1, then update the receiptId(PYDDMMYY#####) and receiptType to 'PREVIOUS_BALANCE'.

module.exports = {
	// TODO: to solve the academic year problem in the previous balance. After the manual creation of AY, will create an hash map of AYs and use it in the migration.

	async up(db) {
		const academicYears = await db
			.collection('academicyears')
			.aggregate([
				{
					$match: {
						deleted: false,
					},
				},
				{
					$sort: {
						startDate: 1,
					},
				},
				{
					$group: {
						_id: '$schoolId',
						academicYearId: {
							$push: '$_id',
						},
					},
				},
			])
			.toArray();
		/*
			[{
				_id: "5f9d1b6b1c3b9a1b1c0f0b1c",
				academicYearId: ["5f9d1b6b1c3b9a1b1c0f0b1c", "5f9d1b6b1c3b9a1b1c0f0b1c"]
			}]
		*/
		const academicYearMap = academicYears.reduce((acc, curr) => {
			// eslint-disable-next-line prefer-destructuring
			acc[curr._id] = curr.academicYearId[0];
			return acc;
		}, {});
		console.log(academicYearMap);

		const feeInstallments = await db
			.collection('feeinstallments')
			.find({
				deleted: false,
				feeTypeId: {
					$in: [
						mongoose.Types.ObjectId('6457397b23b727b3b7d8a668'), // DELETE UMAR NAGAR
						// mongoose.Types.ObjectId('64565aca23b727b3b7d89772'),
						// mongoose.Types.ObjectId('645693c223b727b3b7d89e58'),
						// mongoose.Types.ObjectId('6456986b23b727b3b7d89f2b'),
						// mongoose.Types.ObjectId('64569b9023b727b3b7d8a00a'),
						// mongoose.Types.ObjectId('6457305b23b727b3b7d8a4d5'),
						// mongoose.Types.ObjectId('6457397b23b727b3b7d8a668'),
						// mongoose.Types.ObjectId('64573ba723b727b3b7d8a72a'),
						// mongoose.Types.ObjectId('64573ddd23b727b3b7d8a7e6'),
						// mongoose.Types.ObjectId('64573fb623b727b3b7d8a8ac'),
						// mongoose.Types.ObjectId('645c83ec23b727b3b7d8c83c'),
						// mongoose.Types.ObjectId('646c5b5d507a1e1f0a70de8e'),
						// mongoose.Types.ObjectId('6475e07717550b6b61dcf795'),
						// mongoose.Types.ObjectId('6475edfb17550b6b61dcfa42'),
						// mongoose.Types.ObjectId('647b24c5ecb0e33e17a863ac'),
						// mongoose.Types.ObjectId('64807f21ecb0e33e17a8cae5'),
						// mongoose.Types.ObjectId('6482a918ecb0e33e17a8f288'),
						// mongoose.Types.ObjectId('648fe1364dcd693bac7bce48'),
						// mongoose.Types.ObjectId('64a68b7be5c50765fde07b87'),
					],
				},
				totalAmount: {
					$gt: 0,
				},
			})
			.toArray();

		// If paid amount is 0, then create previous balance object.
		const Operations = feeInstallments.map(async feeInstallment => {
			const {
				studentId,
				totalAmount,
				_id: prevBalInstallmentId,
				paidAmount,
				sectionId,
				schoolId,
				paidDate = null,
			} = feeInstallment;
			const studentInfo = await db
				.collection('students')
				.findOne({ _id: mongoose.Types.ObjectId(studentId) });
			const { name, username, parent_id, gender } = studentInfo;
			const parentInfo = await db
				.collection('parents')
				.findOne({ _id: mongoose.Types.ObjectId(parent_id) });
			const parentName = parentInfo?.name || `${name} Parent`;
			const previousBalance = {
				isEnrolled: true,
				studentId,
				studentName: name,
				parentName,
				schoolId,
				status: 'Due',
				username,
				gender,
				parentId: parent_id,
				sectionId,
				academicYearId: academicYearMap[schoolId] ?? null,
				totalAmount,
				paidAmount,
				dueAmount: totalAmount - paidAmount,
			};
			if (paidAmount > 0) {
				previousBalance.status = paidAmount === totalAmount ? 'Paid' : 'Due';
				previousBalance.lastPaidDate = paidDate;

				const feeReceipts = await db
					.collection('feereceipts')
					.find({
						'items.installmentId':
							mongoose.Types.ObjectId(prevBalInstallmentId),
					})
					.toArray();

				if (feeReceipts.length) {
					const tempReceiptArr = [];

					for (const receipt of feeReceipts) {
						const { _id: rId, items, paidAmount: rPaidAmount } = receipt;
						if (items.length === 1) {
							db.collection('feereceipts').updateOne(
								{ _id: mongoose.Types.ObjectId(rId) },
								{
									$set: {
										receiptType: 'PREVIOUS_BALANCE',
									},
								}
							);
						} else {
							// calculate the total previous balance amount
							const totalPrevBalAmount = items.reduce(
								(acc, item) =>
									item.installmentId.toString() ===
									prevBalInstallmentId.toString()
										? acc + item.paidAmount
										: acc,
								0
							);
							db.collection('feereceipts').updateOne(
								{ _id: mongoose.Types.ObjectId(rId) },
								{
									$set: {
										academicPaidAmount: rPaidAmount - totalPrevBalAmount,
										isPreviousBalance: true,
									},
								}
							);
						}
						tempReceiptArr.push(rId);
					}

					previousBalance.receiptIds = tempReceiptArr;
				}
			}

			await db.collection('previousfeesbalances').insertOne(previousBalance);

			// post migration script
			/*
				Delete the previous balance row from fee Structure
				Remove the previous balance row from fee installments
				Add the academicPaidAmount to the fee Receipts (Filter: isPreviousBalance: {$exists: false}).
				Calculate the total Income from the academicPaidAmount.
				Update the make payment APIs to add the academicPaidAmount to the fee Receipts.
			*/
		});

		return Promise.all(Operations);
	},

	async down(db, client) {
		return Promise.resolve('ok');
	},
};
