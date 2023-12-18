const mongoose = require('mongoose');

module.exports = {
	async up(db) {
		// Get all the discounts
		const discounts = await db
			.collection('discountcategories')
			.find({})
			.toArray();

		const operations = discounts.map(async discount => {
			const { _id: discountId, totalBudget } = discount;
			const amountData = await db
				.collection('feeinstallments')
				.aggregate([
					{
						$match: {
							'discounts.discountId': mongoose.Types.ObjectId(discountId),
						},
					},
					{
						$unwind: {
							path: '$discounts',
							preserveNullAndEmptyArrays: true,
						},
					},
					{
						$match: {
							'discounts.discountId': mongoose.Types.ObjectId(discountId),
						},
					},
					{
						$group: {
							_id: '$discounts.discountId',
							allotted: {
								$sum: {
									$cond: [
										{
											$in: ['$discounts.status', ['Approved', 'Pending']],
										},
										'$discounts.discountAmount',
										0,
									],
								},
							},
							approved: {
								$sum: {
									$cond: [
										{
											$eq: ['$discounts.status', 'Approved'],
										},
										'$discounts.discountAmount',
										0,
									],
								},
							},
						},
					},
				])
				.toArray();
			const countData = await db
				.collection('sectiondiscounts')
				.aggregate([
					{
						$match: {
							discountId: mongoose.Types.ObjectId(discountId),
						},
					},
					{
						$group: {
							_id: '$discountId',
							totalStudents: {
								$sum: '$totalStudents',
							},
							totalPending: {
								$sum: '$totalPending',
							},
							totalApproved: {
								$sum: '$totalApproved',
							},
						},
					},
				])
				.toArray();
			if (amountData.length > 0 && countData.length > 0) {
				const { allotted, approved } = amountData[0];
				const { totalStudents, totalPending, totalApproved } = countData[0];

				// update discount
				return db.collection('discountcategories').updateOne(
					{
						_id: mongoose.Types.ObjectId(discountId),
					},
					{
						$set: {
							budgetAlloted: allotted,
							budgetRemaining: totalBudget - approved,
							totalStudents,
							totalPending,
							totalApproved,
						},
					}
				);
			}
		});

		return Promise.all(operations);
	},

	async down(db, client) {
		return Promise.resolve('ok');
	},
};
