const mongoose = require('mongoose');

module.exports = {
	async up(db) {
		const sectionDiscounts = await db
			.collection('sectiondiscounts')
			.aggregate([
				{
					$lookup: {
						from: 'feetypes',
						localField: 'feeTypeId',
						foreignField: '_id',
						as: 'feeType',
					},
				},
				{ $unwind: { path: '$feeType', preserveNullAndEmptyArrays: true } },
				{
					$group: {
						_id: {
							secId: '$sectionId',
							fsId: '$feeStructureId',
							disId: '$discountId',
						},
						sectionName: {
							$first: '$sectionName',
						},
						schoolId: {
							$first: '$schoolId',
						},
						categoryId: {
							$first: '$categoryId',
						},
						feetypes: {
							$push: {
								feeTypeId: '$feeTypeId',
								feeTypeName: '$feeType.feeType',
								feeAmount: '$totalAmount',
								isPercentage: '$isPercentage',
								value: '$value',
								discountAmount: '$discountAmount',
							},
						},
					},
				},
				{
					$lookup: {
						from: 'discountcategories',
						localField: '_id.disId',
						foreignField: '_id',
						as: 'discount',
					},
				},
				{
					$unwind: {
						path: '$discount',
						preserveNullAndEmptyArrays: true,
					},
				},
				{
					$addFields: {
						discount: '$discount.name',
					},
				},
			])
			.toArray();

		const processDiscount = async sectionDiscount => {
			const { secId, fsId, disId } = sectionDiscount._id;

			const discountStructure = {
				schoolId: sectionDiscount.schoolId,
				categoryId: sectionDiscount.categoryId,
				feeStructureId: fsId,
				sectionId: secId,
				discountId: disId,
			};

			let tempDiscAmount = 0;

			const { feeDetails, totalAmount } = await db
				.collection('feestructures')
				.findOne(
					{ _id: mongoose.Types.ObjectId(fsId) },
					{ feeDetails: 1, totalAmount: 1 }
				);
			discountStructure.totalFeesAmount = totalAmount;
			const tempFeeDetail = await Promise.all(
				sectionDiscount.feetypes.map(async feeType => {
					const {
						feeTypeId,
						feeAmount,
						isPercentage,
						value,
						discountAmount,
						feeTypeName,
					} = feeType;

					tempDiscAmount += discountAmount;

					const feeDetail = feeDetails.find(
						fd => fd.feeTypeId.toString() === feeType.feeTypeId.toString()
					);

					if (!feeDetail) console.log('feeDetail', fsId, feeType.feeTypeId);

					const perBreakdownAmount = value / feeDetail.scheduledDates.length;

					const tempBreakdown = feeDetail.scheduledDates.map(scheduledDate => {
						const { date, amount } = scheduledDate;

						return {
							date,
							amount,
							value: Number(perBreakdownAmount),
						};
					});

					return {
						feeType: {
							id: feeTypeId,
							name: feeTypeName,
						},
						amount: feeAmount,
						isPercentage,
						value,
						discountAmount,
						breakdown: tempBreakdown,
					};
				})
			);

			discountStructure.feeDetails = tempFeeDetail;

			const [ins] = await db
				.collection('feeinstallments')
				.aggregate([
					{
						$match: {
							deleted: false,
							feeStructureId: mongoose.Types.ObjectId(fsId),
							sectionId: mongoose.Types.ObjectId(secId),
							'discounts.discountId': mongoose.Types.ObjectId(disId),
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
							'discounts.discountId': mongoose.Types.ObjectId(disId),
						},
					},
					{
						$group: {
							_id: '$studentId',
							firstDoc: {
								$first: '$$ROOT',
							},
							discountAmount: {
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
					{
						$project: {
							studentId: '$_id',
							approvedAmount: '$discountAmount',
							approvedCount: {
								$cond: [
									{
										$eq: ['$firstDoc.discounts.status', 'Approved'],
									},
									1,
									0,
								],
							},
							pendingCount: {
								$cond: [
									{
										$eq: ['$firstDoc.discounts.status', 'Pending'],
									},
									1,
									0,
								],
							},
						},
					},
					{
						$group: {
							_id: null,
							totalStudents: {
								$sum: 1,
							},
							totalApproveAmount: {
								$sum: '$approvedAmount',
							},
							pendingCount: {
								$sum: '$pendingCount',
							},
							approvedCount: {
								$sum: '$approvedCount',
							},
						},
					},
				])
				.toArray();
			if (ins) {
				const {
					totalStudents,
					totalApproveAmount,
					pendingCount,
					approvedCount,
				} = ins;

				const classDiscountObj = {
					section: {
						id: secId,
						name: sectionDiscount.sectionName,
					},
					discount: {
						id: disId,
						name: sectionDiscount.discount,
					},
					schoolId: sectionDiscount.schoolId,
					categoryId: sectionDiscount.categoryId,
					feeStructureId: fsId,
					totalFeesAmount: totalAmount,
					totalDiscountAmount: tempDiscAmount,
					totalPending: pendingCount,
					totalApproved: approvedCount,
					totalStudents,
					totalApprovedAmount: totalApproveAmount,
				};

				await db.collection('classdiscounts').insertOne(classDiscountObj);
			}

			await db.collection('discountstructures').insertOne(discountStructure);
		};

		const processPromises = sectionDiscounts.map(sectionDiscount =>
			processDiscount(sectionDiscount)
		);

		await Promise.all(processPromises);
	},

	async down(db, client) {
		// TODO write the statements to rollback your migration (if possible)
		// Example:
		// await db.collection('albums').updateOne({artist: 'The Beatles'}, {$set: {blacklisted: false}});
	},
};
