const mongoose = require('mongoose');
const moment = require('moment');
const DiscountCategory = require('../models/discountCategory');
const FeeInstallment = require('../models/feeInstallment');
const FeeStructure = require('../models/feeStructure');
const SectionDiscount = require('../models/sectionDiscount');
const ClassDiscount = require('../models/classDiscount');
const DiscountStructure = require('../models/discountStructure');

const Students = mongoose.connection.db.collection('students');

const catchAsync = require('../utils/catchAsync');
const ErrorResponse = require('../utils/errorResponse');
const SuccessResponse = require('../utils/successResponse');

async function processInstallmentsAndRefunds(
	installmentList,
	refundList,
	discountId
) {
	const studentSet = new Set();
	const installmentBulkOps = [];
	const refundBulkOps = [];

	for (const installment of installmentList) {
		if (installment.discountAmount) {
			const { installmentId, studentId, isPercentage, value, discountAmount } =
				installment;

			if (!studentSet.has(studentId)) {
				studentSet.add(studentId);
			}

			const updateObj = {
				$push: {
					discounts: {
						discountId,
						discountAmount,
						isPercentage,
						value,
						status: 'Pending',
					},
				},
			};

			installmentBulkOps.push({
				updateOne: {
					filter: {
						_id: installmentId,
					},
					update: updateObj,
				},
			});
		}
	}

	for (const refund of refundList) {
		const { studentId, amount } = refund;

		refundBulkOps.push({
			updateOne: {
				filter: {
					_id: mongoose.Types.ObjectId(studentId),
				},
				update: {
					$inc: {
						'refund.totalAmount': amount,
					},
					$push: {
						'refund.history': {
							id: mongoose.Types.ObjectId(discountId),
							amount,
							date: new Date(),
							reason: 'Discount Refund',
							status: 'PENDING',
						},
					},
				},
			},
		});
	}

	return Promise.resolve({
		installmentBulkOps,
		refundBulkOps,
		updatedStudentSet: studentSet,
	});
}

function groupDiscounts(data) {
	const groupedData = new Map();

	data.forEach(entry => {
		const {
			section,
			totalStudents,
			totalPending,
			totalApproved,
			totalApprovedAmount,
		} = entry;
		const sectionId = section.id;

		let sectionData = groupedData.get(sectionId.toString());

		if (!sectionData) {
			sectionData = {
				id: sectionId,
				name: section.name,
				totalAmount: 0,
				totalStudents: 0,
				pendingStudents: 0,
				approvedStudents: 0,
			};
			groupedData.set(sectionId.toString(), sectionData);
		}

		sectionData.totalAmount += totalApprovedAmount;
		sectionData.totalStudents += totalStudents;
		sectionData.approvedStudents += totalApproved;
		sectionData.pendingStudents += totalPending;
	});

	return Array.from(groupedData.values());
}

function calculateDiscountAmount(dueAmount, isPercentage, value) {
	return isPercentage ? (dueAmount / 100) * value : value;
}
// Create a new discount
const createDiscountCategory = async (req, res, next) => {
	try {
		const {
			name,
			description = '',
			schoolId,
			totalBudget = 0,
			budgetRemaining = 0,
			createdBy,
		} = req.body;
		if (!name || !schoolId || !totalBudget || !budgetRemaining) {
			return next(new ErrorResponse('Please Provide All Required Fields', 422));
		}
		const isExists = await DiscountCategory.findOne({
			name,
			schoolId,
		});

		if (isExists) {
			return next(new ErrorResponse(`Discount ${name} Already Exists`, 400));
		}

		const discount = await DiscountCategory.create({
			name,
			description,
			schoolId,
			totalBudget,
			budgetRemaining,
			createdBy,
		});
		res.status(201).json(SuccessResponse(discount, 1, 'Created Successfully'));
	} catch (error) {
		console.log(error.message);
		return next(new ErrorResponse('Something Went Wrong', 500));
	}
};

/*
TODO: Need to fetch sectionDiscount aggregation.
With the row discount data.
[{
	sectionId: 'sectionId',
	sectionName: 'sectionName',
	totalAmount: 15000',
	totalStudents: 50,
	approvedStudents: 30,
	pendingStudents: 20,
}]
*/
const getDiscountCategoryByClass = catchAsync(async (req, res, next) => {
	const { id } = req.params;
	const query = {
		'discount.id': mongoose.Types.ObjectId(id),
	};

	const classList = await ClassDiscount.find(query).lean();

	if (classList.length === 0)
		return next(new ErrorResponse('No Classes Mapped', 404));

	const result = groupDiscounts(classList);

	res
		.status(200)
		.json(SuccessResponse(result, result.length, 'Fetched Successfully'));
});

const getStudentsByStructure = catchAsync(async (req, res, next) => {
	const { id, structureId } = req.params;
	const { sectionId } = req.query;

	if (!sectionId)
		return next(new ErrorResponse('Please Provide Section Id', 422));

	// Fetch attachments object from discount
	const { attachments = {} } = await DiscountCategory.findOne({
		_id: id,
	});

	const aggregate = [
		{
			$match: {
				feeStructureId: mongoose.Types.ObjectId(structureId),
				sectionId: mongoose.Types.ObjectId(sectionId),
				deleted: false,
			},
		},
		{
			$addFields: {
				dueAmount: {
					$subtract: ['$netAmount', '$paidAmount'],
				},
			},
		},
		{
			$group: {
				_id: {
					studentId: '$studentId',
					feeType: '$feeType',
				},
				totalDiscountAmount: {
					$sum: '$totalDiscountAmount',
				},
				dueAmount: {
					$sum: '$dueAmount',
				},
				paidAmount: {
					$sum: '$paidAmount',
				},
				totalFees: {
					$sum: '$totalAmount',
				},
				netAmount: {
					$sum: '$netAmount',
				},
				matchedDiscount: {
					$push: {
						$cond: {
							if: {
								$eq: [
									{
										$size: '$discounts',
									},
									0,
								],
							},
							then: '$$REMOVE',
							else: {
								$arrayElemAt: [
									{
										$filter: {
											input: '$discounts',
											as: 'discount',
											cond: {
												$eq: [
													'$$discount.discountId',
													mongoose.Types.ObjectId(id),
												],
											},
										},
									},
									0,
								],
							},
						},
					},
				},
				breakdown: {
					$push: {
						_id: '$_id',
						date: '$date',
						totalAmount: '$totalAmount',
						netAmount: '$netAmount',
						paidAmount: '$paidAmount',
						dueAmount: '$dueAmount',
					},
				},
			},
		},
		{
			$group: {
				_id: '$_id.studentId',
				discountApplied: {
					$sum: {
						$reduce: {
							input: '$matchedDiscount',
							initialValue: 0,
							in: {
								$add: ['$$value', '$$this.discountAmount'],
							},
						},
					},
				},
				discountStatus: {
					$push: {
						$cond: {
							if: {
								$eq: ['$matchedDiscount', []],
							},
							then: '$$REMOVE',
							else: '$matchedDiscount.status',
						},
					},
				},
				totalDiscountAmount: {
					$sum: '$totalDiscountAmount',
				},
				dueAmount: {
					$sum: '$dueAmount',
				},
				paidAmount: {
					$sum: '$paidAmount',
				},
				totalFees: {
					$sum: '$totalFees',
				},
				feeDetails: {
					$push: {
						feeType: '$_id.feeType',
						totalFees: '$totalFees',
						netFees: '$netAmount',
						dueAmount: '$dueAmount',
						breakdown: '$breakdown',
					},
				},
			},
		},
		{
			$lookup: {
				from: 'students',
				localField: '_id',
				foreignField: '_id',
				as: 'student',
			},
		},
		{
			$unwind: '$student',
		},
		{
			$project: {
				studentName: '$student.name',
				paidAmount: 1,
				admission_no: '$student.admission_no',
				totalDiscountAmount: 1,
				totalFees: 1,
				dueAmount: 1,
				discountApplied: 1,
				discountStatus: {
					$arrayElemAt: [
						{
							$first: '$discountStatus',
						},
						0,
					],
				},
				feeDetails: 1,
			},
		},
	];

	let students = await FeeInstallment.aggregate(aggregate);
	if (students.length === 0) {
		return next(new ErrorResponse('No Students Found', 404));
	}
	// check if status field exists if yes then isSelected = true else false
	students = students.map(student => {
		if (student.discountStatus) {
			student.isSelected = true;
		} else {
			student.isSelected = false;
		}
		if (attachments[student._id.toString()]) {
			student.attachments = attachments[student._id.toString()];
		}
		return student;
	});
	res
		.status(200)
		.json(SuccessResponse(students, students.length, 'Fetched Successfully'));
});

const getStudentsByFilter = catchAsync(async (req, res, next) => {
	const { id } = req.params;
	const { sectionId, status, page = 0, limit = 5 } = req.query;
	const query = {
		discounts: {
			$elemMatch: {
				discountId: mongoose.Types.ObjectId(id),
			},
		},
	};
	if (sectionId) {
		query.sectionId = mongoose.Types.ObjectId(sectionId);
	}
	if (status) {
		query.discounts.$elemMatch.status = status;
	}
	const students = await FeeInstallment.aggregate([
		{
			$match: query,
		},
		{
			$unwind: {
				path: '$discounts',
				preserveNullAndEmptyArrays: true,
			},
		},
		{
			$match: {
				'discounts.discountId': mongoose.Types.ObjectId(id),
			},
		},
	]);
	res
		.status(200)
		.json(SuccessResponse(students, students.length, 'Fetched Successfully'));
});

// Get all discounts
const getDiscountCategory = catchAsync(async (req, res, next) => {
	const { schoolId, page = 0, limit = 10 } = req.query;
	const query = {};
	if (schoolId) {
		query.schoolId = mongoose.Types.ObjectId(schoolId);
	}

	const aggregate = [
		{
			$facet: {
				data: [
					{
						$match: query,
					},
					{
						$project: {
							name: 1,
							classesAssociated: 1,
							totalBudget: 1,
							budgetAlloted: 1,
							totalDiscount: {
								$subtract: ['$totalBudget', '$budgetRemaining'],
							},
							budgetRemaining: 1,
							totalStudents: 1,
							totalApproved: 1,
							totalPending: 1,
						},
					},
					{ $skip: +page * +limit },
					{ $limit: +limit },
				],
				count: [
					{
						$match: query,
					},
					{ $count: 'count' },
				],
			},
		},
	];

	const [{ data, count }] = await DiscountCategory.aggregate(aggregate);

	if (count.length === 0) {
		return next(new ErrorResponse('Discounts Not Found', 404));
	}
	res
		.status(200)
		.json(SuccessResponse(data, count[0].count, 'Fetched Successfully'));
});

const getDiscountCategoryById = catchAsync(async (req, res, next) => {
	const { id } = req.params;

	const projection = {
		name: 1,
		description: 1,
		totalBudget: 1,
		totalDiscount: {
			$subtract: ['$totalBudget', '$budgetRemaining'],
		},
		budgetRemaining: 1,
		classesAssociated: 1,
		totalStudents: 1,
	};

	const discount = await DiscountCategory.findOne(
		{
			_id: id,
		},
		projection
	);
	if (!discount) {
		return next(new ErrorResponse('Discount Not Found', 404));
	}
	res.status(200).json(SuccessResponse(discount, 1, 'Fetched Successfully'));
});

const updateDiscountCategory = async (req, res, next) => {
	const { id } = req.params;
	const { name, description, totalBudget } = req.body;
	try {
		const discount = await DiscountCategory.findById(id);

		if (!discount) {
			return next(new ErrorResponse('Discount Not Found', 404));
		}
		const budgetSpent = discount.totalBudget - discount.budgetRemaining; // budgetSpent
		// Error if totalBudget < discount.totalBudget - discount.remainingBudget
		if (totalBudget < budgetSpent) {
			return next(
				new ErrorResponse(
					'Cannot Update Total Budget Less Than Budget Spent',
					400
				)
			);
		}
		// find the difference
		const difference = totalBudget - discount.totalBudget;
		// update the remaining budget
		discount.name = name;
		discount.description = description;
		discount.totalBudget = totalBudget;
		discount.budgetRemaining += difference;
		await discount.save();

		res.status(200).json(SuccessResponse(discount, 1, 'Updated Successfully'));
	} catch (error) {
		console.log(error);
		return next(new ErrorResponse('Something Went Wrong', 500));
	}
};

// Delete a discount
const deleteDiscountCategory = catchAsync(async (req, res, next) => {
	const { id } = req.params;
	const discount = await DiscountCategory.findOneAndDelete(id);
	if (!discount) {
		return next(new ErrorResponse('Discount Not Found', 404));
	}
	res.status(200).json(SuccessResponse(null, 1, 'Deleted Successfully'));
});

// * Since in the new discount flow each student will have its fee details in which the amount will be there for each distribution.
// * So we need to fetch the fee details and then calculate the discount amount for each installment and then update the discount amount in the fee installment.
// * Also we need to handle the refund amount if the discount amount is excess.
// * Also we need to update the total discount amount in the student collection.
// * Also we need to update/create discountStructure document.
// * Also we need to update the total discount amount in the classDiscount collection.
// * Also we need to update the total discount amount in the discountCategory collection.

const mapDiscountCategory = async (req, res, next) => {
	try {
		const {
			sectionId,
			categoryId,
			rows,
			studentList,
			sectionName,
			feeStructureId,
		} = req.body;
		const { discountId } = req.params;
		const { school_id } = req.user;

		if (!sectionId || !categoryId || !rows || studentList.length === 0) {
			return next(new ErrorResponse('Please Provide All Required Fields', 422));
		}

		let discountAmount = 0;
		const studentMap = {};
		const studentMapDup = { ...studentMap };
		const uniqueStudList = [
			...new Set(studentList.map(({ studentId }) => studentId)),
		];
		const attachmentObj = {};
		const feeStructure = await FeeStructure.findOne(
			{ _id: feeStructureId },
			'feeDetails'
		).lean();
		const feeDetails = feeStructure.feeDetails.reduce(
			(acc, { feeTypeId, totalAmount, scheduledDates }) => {
				acc[feeTypeId] = { totalAmount, scheduledDates };
				return acc;
			},
			{}
		);

		const refundMap = {};

		const classList = [];
		for (const { rowId, feeTypeId, isPercentage, value, breakdown } of rows) {
			const tempStudMap = { ...studentMapDup };
			if (!rowId || isPercentage === undefined || !value) {
				return next(
					new ErrorResponse('Please Provide All Required Fields', 422)
				);
			}

			const { totalAmount } = feeDetails[feeTypeId];

			const tempDiscountAmount = calculateDiscountAmount(
				totalAmount,
				isPercentage,
				value
			);

			const bulkOps = [];

			const filter = { studentId: { $in: uniqueStudList }, rowId };
			const projections = {
				netAmount: 1,
				paidAmount: 1,
				studentId: 1,
				totalAmount: 1,
			};

			const feeInstallments = await FeeInstallment.find(
				filter,
				projections
			).lean();

			if (!feeInstallments.length) {
				return next(new ErrorResponse('No Fee Installment Found', 404));
			}

			for (const stud of uniqueStudList) {
				let discountTempAmount = tempDiscountAmount;
				const installments = feeInstallments.filter(
					({ studentId }) => studentId.toString() === stud.toString()
				);
				let insCount = 0;

				for (const {
					netAmount,
					paidAmount,
					totalAmount: insTotalAmount,
					_id,
				} of installments) {
					const dueAmount = netAmount - paidAmount;

					if (discountTempAmount === 0) break;

					if (dueAmount > 0) {
						const minAmount = Math.min(dueAmount, discountTempAmount);

						const insDiscountValue = isPercentage
							? (minAmount / insTotalAmount) * 100
							: minAmount;
						const insDiscountAmount = isPercentage
							? (insDiscountValue / 100) * insTotalAmount
							: insDiscountValue;

						const updateObj = {
							$push: {
								discounts: {
									discountId,
									discountAmount: insDiscountAmount,
									isPercentage,
									value: insDiscountValue,
									status: 'Pending',
								},
							},
						};

						bulkOps.push({
							updateOne: {
								filter: { _id },
								update: updateObj,
							},
						});

						studentMap[stud] = (studentMap[stud] || 0) + 1;
						tempStudMap[stud] = (tempStudMap[stud] || 0) + 1;

						discountTempAmount -= insDiscountAmount;
					}

					insCount += 1;

					// If the discount amount is excess, then add it to the refund map
					if (insCount === installments.length && discountTempAmount > 0) {
						refundMap[stud] = (refundMap[stud] || 0) + discountTempAmount;
					}
				}
			}

			if (bulkOps.length > 0) {
				await FeeInstallment.bulkWrite(bulkOps);
			}

			const reducedStudentList = uniqueStudList.filter(
				studentId => tempStudMap[studentId] > 0
			);

			// update the discount amount
			discountAmount += tempDiscountAmount * reducedStudentList.length;

			classList.push({
				discountId,
				sectionId,
				sectionName,
				feeTypeId,
				categoryId,
				feeStructureId: feeStructure._id,
				totalStudents: reducedStudentList.length,
				totalPending: reducedStudentList.length,
				schoolId: school_id,
				totalAmount,
				discountAmount: tempDiscountAmount,
				breakdown,
				isPercentage,
				value,
			});
		}

		const filteredStudentList = uniqueStudList.filter(
			studentId => studentMap[studentId] > 0
		);

		if (!filteredStudentList.length) {
			return next(
				new ErrorResponse('Cannot Apply Discount, Insufficient Fees', 404)
			);
		}

		if (Object.keys(refundMap).length > 0) {
			const refundBulkOps = [];
			for (const [studentId, refundAmount] of Object.entries(refundMap)) {
				const updateObj = {
					updateOne: {
						filter: { _id: mongoose.Types.ObjectId(studentId) },
						update: {
							$inc: {
								'refund.totalAmount': refundAmount,
							},

							$push: {
								'refund.history': {
									id: mongoose.Types.ObjectId(discountId),
									amount: refundAmount,
									date: new Date(),
									reason: 'Discount Refund',
									status: 'PENDING',
								},
							},
						},
					},
				};
				refundBulkOps.push(updateObj);
			}
			// update the refund amount in the student collection
			await Students.bulkWrite(refundBulkOps);
		}

		// TODO: Update ClassDiscount Collection for TS, TA, TP and totalApprovedAmount.
		await SectionDiscount.insertMany(classList);

		// TODO: classesAssociated should be verified in the above db call. if exists, then don't increment.
		await DiscountCategory.updateOne(
			{
				_id: discountId,
			},
			{
				$inc: {
					budgetAlloted: discountAmount,
					totalStudents: filteredStudentList.length,
					totalPending: filteredStudentList.length,
					classesAssociated: 1,
				},
				$set: {
					attachments: attachmentObj,
				},
			}
		);

		res.json(SuccessResponse(null, 1, 'Mapped Successfully'));
	} catch (error) {
		return next(new ErrorResponse('Something went wrong', 500));
	}
};

const getStudentForApproval = catchAsync(async (req, res, next) => {
	const {
		sectionId = null,
		page = 0,
		limit = 5,
		status = 'Pending',
		discountId = null,
		searchTerm = null,
	} = req.query;
	const { school_id } = req.user;
	const secMatch = {
		'discounts.status': status,
	};

	// Create payload for the query
	const payload = {
		schoolId: mongoose.Types.ObjectId(school_id),
		discounts: {
			$elemMatch: {
				status,
			},
		},
	};
	if (sectionId) payload.sectionId = mongoose.Types.ObjectId(sectionId);
	if (discountId) {
		payload.discounts.$elemMatch.discountId =
			mongoose.Types.ObjectId(discountId);
		secMatch['discounts.discountId'] = mongoose.Types.ObjectId(discountId);
	}

	if (searchTerm) {
		const match = {
			name: {
				$regex: searchTerm,
				$options: 'i',
			},
		};
		// eslint-disable-next-line no-unused-expressions
		sectionId ? (match.section = mongoose.Types.ObjectId(sectionId)) : null;
		const studentIds = await Students.distinct('_id', match);
		payload.studentId = {
			$in: studentIds,
		};
	}

	const aggregate = [
		{
			$match: payload,
		},
		{
			$unwind: {
				path: '$discounts',
				preserveNullAndEmptyArrays: true,
			},
		},
		{
			$match: secMatch,
		},
		{
			$group: {
				_id: {
					studId: '$studentId',
					disId: '$discounts.discountId',
				},
				discountAmount: {
					$sum: '$discounts.discountAmount',
				},
			},
		},
		{
			$facet: {
				data: [
					{
						$skip: +page * +limit,
					},
					{
						$limit: +limit,
					},
					{
						$lookup: {
							from: 'feeinstallments',
							let: {
								studId: '$_id.studId',
							},
							pipeline: [
								{
									$match: {
										$expr: {
											$and: [
												{
													$eq: ['$studentId', '$$studId'],
												},
												{
													$eq: ['$deleted', false],
												},
											],
										},
									},
								},
								{
									$project: {
										totalAmount: 1,
									},
								},
							],
							as: 'fee',
						},
					},
					{
						$addFields: {
							fee: {
								$sum: '$fee.totalAmount',
							},
						},
					},
					{
						$lookup: {
							from: 'previousfeesbalances',
							localField: '_id.studId',
							foreignField: 'studentId',
							as: 'prev',
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
						$lookup: {
							from: 'students',
							localField: '_id.studId',
							foreignField: '_id',
							as: 'student',
						},
					},
					{
						$unwind: {
							path: '$student',
							preserveNullAndEmptyArrays: true,
						},
					},
					{
						$lookup: {
							from: 'sections',
							localField: 'student.section',
							foreignField: '_id',
							as: 'section',
						},
					},
					{
						$project: {
							_id: 0,
							studentId: '$_id.studId',
							studentName: '$student.name',
							sectionId: '$student.section',
							className: {
								$first: '$section.className',
							},
							profile_image: '$student.profile_image',
							totalFees: {
								$add: [
									'$fee',
									{
										$ifNull: [
											{
												$first: '$prev.totalAmount',
											},
											0,
										],
									},
								],
							},
							discountId: {
								$first: '$discount._id',
							},
							discountAmount: 1,
							discountName: {
								$first: '$discount.name',
							},
						},
					},
				],
				totalCount: [
					{
						$count: 'count',
					},
				],
			},
		},
	];

	const [{ data, totalCount }] = await FeeInstallment.aggregate(aggregate);

	if (!data.length) {
		return next(new ErrorResponse('No Students Found', 404));
	}

	res
		.status(200)
		.json(SuccessResponse(data, totalCount[0].count, 'Fetched SuccessFully'));
});

const approveStudentDiscount = async (req, res, next) => {
	// TODO: Need to take confirmation from the approver with the amount that can be approved.
	const { discountId } = req.params;
	const { studentId, status, sectionId } = req.body;
	const bulkOps = [];
	const promises = [];

	// input validation
	if (
		!studentId ||
		(status !== 'Approved' && status !== 'Rejected') ||
		!sectionId ||
		!discountId
	) {
		return next(new ErrorResponse('Please Provide All Required Fields', 422));
	}
	let attachments = {};
	let updatedAmount = 0;
	let amountToSub = 0;
	let installmentLoopCount = 0;
	try {
		const update = {
			totalPending: -1,
			totalApproved: status === 'Approved' ? 1 : 0,
			totalStudents: status === 'Rejected' ? -1 : 0,
		};
		const sectionUpdate = {
			totalPending: -1,
			totalApproved: status === 'Approved' ? 1 : 0,
			totalStudents: status === 'Rejected' ? -1 : 0,
		};
		const feeInstallments = await FeeInstallment.find({
			studentId: mongoose.Types.ObjectId(studentId),
			discounts: {
				$elemMatch: {
					discountId: mongoose.Types.ObjectId(discountId),
					status: 'Pending',
				},
			},
		}).lean();

		if (!feeInstallments.length) {
			return next(new ErrorResponse('No Fee Installment Found', 404));
		}
		const { feeStructureId } = feeInstallments[0];

		for (const {
			_id,
			discounts,
			paidAmount,
			netAmount,
			status: installmentStatus,
		} of feeInstallments) {
			const query = {
				_id,
				discounts: {
					$elemMatch: {
						discountId: mongoose.Types.ObjectId(discountId),
						status: 'Pending',
					},
				},
			};

			// find the discount amount in the discounts array
			const discount = discounts.find(
				d => d.discountId.toString() === discountId.toString()
			);
			if (!discount) {
				return next(new ErrorResponse('No Discount Found', 404));
			}
			const { discountAmount } = discount;
			const dueAmount = netAmount - paidAmount;
			if (status === 'Approved' && discountAmount <= dueAmount) {
				installmentLoopCount += 1;
				updatedAmount += discountAmount;
				const updateObj = {
					$set: {
						'discounts.$.status': 'Approved',
					},
					$inc: {
						totalDiscountAmount: discountAmount,
						netAmount: -discountAmount,
					},
				};

				if (dueAmount === discountAmount) {
					updateObj.$set.status = installmentStatus === 'Due' ? 'Late' : 'Paid';
				}

				bulkOps.push({
					updateOne: {
						filter: query,
						update: updateObj,
					},
				});
			} else {
				amountToSub += discountAmount; // to be subtracted from the budget alloted
				// remove that match from the discounts array

				bulkOps.push({
					updateOne: {
						filter: query,
						update: {
							$pull: {
								discounts: {
									discountId: mongoose.Types.ObjectId(discountId),
								},
							},
						},
					},
				});
			}
		}

		const finalUpdate = {
			$inc: {
				...update,
				budgetRemaining: -updatedAmount, // If Rejected, then 0 is subtracted
				budgetAlloted: -amountToSub,
			},
		};

		if (status === 'Approved' && installmentLoopCount === 0) {
			return next(
				new ErrorResponse(
					'Amount Exceeds Balance Fee. Cannot Approve Discount',
					400
				)
			);
		}

		if (status === 'Rejected' && installmentLoopCount === 0) {
			const discountCategory = await DiscountCategory.findOne({
				_id: discountId,
			});
			attachments = discountCategory.attachments ?? {};
			if (attachments[studentId.toString()]) {
				delete attachments[studentId.toString()];
			}
			finalUpdate.$set = { attachments };
		}

		if (bulkOps.length) {
			await FeeInstallment.bulkWrite(bulkOps);
		}

		// Update hasDiscount Field in Students
		if (installmentLoopCount > 0) {
			promises.push(
				Students.updateOne(
					{
						_id: mongoose.Types.ObjectId(studentId),
						deleted: false,
						profileStatus: 'APPROVED',
					},
					{
						$set: {
							hasDiscount: true,
						},
					}
				)
			);
		}

		// Update the totalPending and totalApproved in DiscountCategory
		promises.push(
			DiscountCategory.updateOne({ _id: discountId }, finalUpdate),
			ClassDiscount.updateMany(
				{
					'discount.id': discountId,
					'section.id': sectionId,
					feeStructureId,
				},
				{
					$inc: {
						...sectionUpdate,
						totalApprovedAmount: updatedAmount, // if rejected, then 0 is added
					},
				}
			)
		);

		await Promise.all([...promises]);
		res.json(SuccessResponse(null, 1, 'Updated Successfully'));
	} catch (err) {
		return next(new ErrorResponse('Something Went Wrong', 500));
	}
};

const addAttachment = async (req, res, next) => {
	const { studentId, attachment, discountId } = req.body;
	try {
		const discount = await DiscountCategory.findOne({
			_id: discountId,
		});
		if (!discount) {
			return next(new ErrorResponse('Discount Not Found', 404));
		}
		const { attachments = {} } = discount;
		attachments[studentId] = attachment;
		await DiscountCategory.updateOne(
			{
				_id: discountId,
			},
			{
				$set: {
					attachments,
				},
			}
		);
		res.json(SuccessResponse(null, 1, 'Updated Successfully'));
	} catch (err) {
		return next(new ErrorResponse('Something Went Wrong', 500));
	}
};

const addStudentToDiscount = async (req, res, next) => {
	const requiredFields = [
		'installmentList',
		'discountName',
		'sectionId',
		'categoryId',
		'feeStructureId',
		'sectionName',
		'totalDiscountAmount',
	];
	try {
		const { discountId } = req.params; // Assuming the discountId is passed in the URL parameters
		const {
			sectionId,
			sectionName,
			discountName,
			categoryId,
			feeStructureId,
			totalDiscountAmount,
			installmentList,
			refundList,
		} = req.body;
		const { school_id } = req.user;

		// validation for required fields
		const missingFields = requiredFields.filter(field => !(field in req.body));
		if (missingFields.length > 0)
			return next(new ErrorResponse('Please Provide All Required Fields', 422));

		if (!installmentList.length)
			return next(new ErrorResponse('No Students Selected', 422));

		const structureDoc = await FeeStructure.findOne(
			{ _id: feeStructureId },
			{ totalAmount: 1 }
		);

		const totalAllottedDiscount = installmentList.reduce(
			(total, installment) => total + (installment.discountAmount || 0),
			0
		);
		const classDiscount = await ClassDiscount.find({
			'discount.id': discountId,
			'section.id': sectionId,
		}).lean();

		const { installmentBulkOps, refundBulkOps, updatedStudentSet } =
			await processInstallmentsAndRefunds(
				installmentList,
				refundList,
				discountId
			);

		if (installmentBulkOps.length)
			await FeeInstallment.bulkWrite(installmentBulkOps);
		if (refundBulkOps.length) await Students.bulkWrite(refundBulkOps);

		const discountUpdate = {
			$inc: {
				totalStudents: updatedStudentSet.size,
				totalPending: updatedStudentSet.size,
				budgetAlloted: totalAllottedDiscount,
			},
		};

		if (
			!classDiscount.some(
				doc => doc.feeStructureId.toString() === feeStructureId.toString()
			)
		) {
			const classDiscountObj = {
				discount: {
					id: discountId,
					name: discountName,
				},
				section: {
					id: sectionId,
					name: sectionName,
				},
				sectionName,
				schoolId: school_id,
				categoryId,
				feeStructureId,
				totalDiscountAmount,
				totalStudents: updatedStudentSet.size,
				totalApprovedAmount: 0,
				totalPending: updatedStudentSet.size,
				totalApproved: 0,
				totalFeesAmount: structureDoc.totalAmount,
			};
			await ClassDiscount.create(classDiscountObj);
			discountUpdate.$inc.classesAssociated = 1;
		} else {
			// update the classDiscount
			await ClassDiscount.updateOne(
				{
					_id: classDiscount._id,
				},
				{
					$inc: {
						totalStudents: updatedStudentSet.size,
						totalPending: updatedStudentSet.size,
					},
				}
			);
		}

		await DiscountCategory.updateOne({ _id: discountId }, discountUpdate);

		// Return success response
		res.status(200).json(null, updatedStudentSet.size, 'Updated Successfully');
	} catch (error) {
		console.error(error);
		res.status(500).json({ error: 'Internal Server Error' });
	}
};

const getSectionDiscount = catchAsync(async (req, res, next) => {
	const { id, feeStructureId } = req.params;
	const filter = {
		discountId: mongoose.Types.ObjectId(id),
		feeStructureId: mongoose.Types.ObjectId(feeStructureId),
	};
	const structure = await DiscountStructure.findOne(
		filter,
		'feeDetails discountId'
	).populate('discountId', 'totalBudget budgetAlloted budgetRemaining');

	if (!structure) {
		return next(new ErrorResponse('No Discount Found', 404));
	}
	const { feeDetails, discountId } = structure;

	res.json(
		SuccessResponse(
			{ discountDetails: discountId, feeDetails },
			feeDetails.length,
			'Fetched Successfully'
		)
	);
});

const discountReport = catchAsync(async (req, res, next) => {
	const { school_id } = req.user;
	// find all the sectionDiscounts of the school and group it and sort by section.
	const sectionDiscounts = await SectionDiscount.aggregate([
		{
			$match: {
				schoolId: mongoose.Types.ObjectId(school_id),
			},
		},
		{
			$group: {
				_id: '$sectionId',
				sectionName: {
					$first: '$sectionName',
				},
				discountAmount: { $sum: '$discountAmount' },
				totalStudents: { $sum: '$totalStudents' },
				totalPending: { $sum: '$totalPending' },
				totalApproved: { $sum: '$totalApproved' },
			},
		},
		{
			$sort: {
				discountAmount: -1,
			},
		},
	]);
	if (!sectionDiscounts) {
		return next(new ErrorResponse('No Discount Mapped', 404));
	}
	res
		.status(200)
		.json(SuccessResponse(sectionDiscounts, 1, 'Fetched Successfully'));
});

const revokeStudentDiscount = catchAsync(async (req, res, next) => {
	const { id } = req.params;
	const { studentId } = req.body;
	const promises = [];
	let totalDiscountAmount = 0;
	// Fetch all feeInstallments of the student

	const feeInstallments = await FeeInstallment.find({
		studentId: mongoose.Types.ObjectId(studentId),
		discounts: {
			$elemMatch: {
				discountId: mongoose.Types.ObjectId(id),
				status: 'Approved',
			},
		},
	}).lean();
	if (!feeInstallments.length) {
		return next(new ErrorResponse('No Fee Installment Found', 404));
	}
	// check if any installment has paidAmount > 0
	const paidInstallments = feeInstallments.some(
		({ paidAmount }) => paidAmount > 0
	);
	if (paidInstallments) {
		return next(
			new ErrorResponse('Cannot Revoke Discount, Receipts Are Generated', 400)
		);
	}

	// find if there is refund for that discount of this student
	const studentDoc = await Students.findOne({
		_id: mongoose.Types.ObjectId(studentId),
		'refund.history': {
			$elemMatch: {
				id: mongoose.Types.ObjectId(id),
				status: 'PENDING',
			},
		},
	});

	const { sectionId, feeStructureId } = feeInstallments[0];
	// Update the feeInstallments
	for (const { _id, discounts, date, status } of feeInstallments) {
		const discount = discounts.find(
			d => d.discountId.toString() === id.toString()
		);
		if (!discount) {
			return next(new ErrorResponse('No Discount Found', 404));
		}
		const { discountAmount } = discount;
		totalDiscountAmount += discountAmount;
		const updateObj = {
			// remove that discount object
			$pull: {
				discounts: {
					discountId: mongoose.Types.ObjectId(id),
				},
			},
			// update the totalDiscountAmount and netAmount
			$inc: {
				totalDiscountAmount: -discountAmount,
				netAmount: discountAmount,
			},
		};

		// update the feeinstallment status
		if ((status === 'Late' || status === 'Paid') && discountAmount) {
			const insStatus = moment(date).isBefore(moment()) ? 'Due' : 'Upcoming';
			updateObj.$set = {
				status: insStatus,
			};
		}

		await FeeInstallment.findOneAndUpdate(
			{
				_id,
				discounts: {
					$elemMatch: {
						discountId: mongoose.Types.ObjectId(id),
						status: 'Approved',
					},
				},
			},
			updateObj
		);
	}

	// Update the totalApproved and totalPending in sectionDiscount

	promises.push(
		ClassDiscount.updateMany(
			{
				'discountId.id': mongoose.Types.ObjectId(id),
				'sectionId.id': mongoose.Types.ObjectId(sectionId),
				feeStructureId: mongoose.Types.ObjectId(feeStructureId),
			},
			{
				$inc: {
					totalStudents: -1,
					totalApproved: -1,
					totalApprovedAmount: -totalDiscountAmount,
				},
			}
		),
		DiscountCategory.updateOne(
			{
				_id: id,
			},
			{
				$inc: {
					budgetRemaining: totalDiscountAmount,
					totalStudents: -1,
					totalApproved: -1,
					budgetAlloted: -totalDiscountAmount,
				},
			}
		)
	);

	if (studentDoc) {
		const { history } = studentDoc.refund;
		const { amount } = history.find(h => h.id.toString() === id.toString());
		promises.push(
			Students.updateOne(
				{
					_id: mongoose.Types.ObjectId(studentId),
				},
				{
					$pull: {
						'refund.history': {
							id: mongoose.Types.ObjectId(id),
						},
					},
					$inc: {
						'refund.totalAmount': -amount,
					},
				}
			)
		);
	}

	await Promise.all(promises);

	// Get boolean if there are any discounts still associated.
	const associated = await FeeInstallment.exists({
		studentId: mongoose.Types.ObjectId(studentId),
		discounts: {
			$elemMatch: {
				status: 'Approved',
			},
		},
	});

	if (!associated) {
		// set hasDiscount false in student
		await Students.updateOne(
			{
				_id: mongoose.Types.ObjectId(studentId),
			},
			{
				$set: {
					hasDiscount: false,
				},
			}
		);
	}

	res.status(200).json(SuccessResponse(null, 1, 'Revoked Successfully'));
});

const getDiscountBySchool = catchAsync(async (req, res, next) => {
	const { schoolId } = req.params;

	const discountData = await DiscountCategory.find(
		{
			schoolId,
		},
		{
			name: 1,
		}
	).lean();

	if (!discountData.length)
		return next(new ErrorResponse('No Discount Found', 404));

	res.json(
		SuccessResponse(discountData, discountData.length, 'Fetched Successfully')
	);
});

const getStudentsWithDiscount = catchAsync(async (req, res, next) => {
	const { school_id } = req.user;
	const {
		sectionId = null,
		searchTerm = null,
		page = 0,
		limit = 5,
	} = req.query;

	const match = {
		school_id: mongoose.Types.ObjectId(school_id),
		deleted: false,
		profileStatus: 'APPROVED',
		hasDiscount: true,
	};

	if (sectionId) match.section = mongoose.Types.ObjectId(sectionId);
	if (searchTerm) match.name = { $regex: searchTerm, $options: 'i' };

	const studAggregate = [
		{
			$match: match,
		},
		{
			$sort: {
				name: 1,
			},
		},
		{
			$facet: {
				students: [
					{
						$skip: +page * +limit,
					},
					{
						$limit: +limit,
					},
					{
						$lookup: {
							from: 'sections',
							localField: 'section',
							foreignField: '_id',
							as: 'section',
						},
					},
					{
						$lookup: {
							from: 'feeinstallments',
							let: {
								studId: '$_id',
							},
							pipeline: [
								{
									$match: {
										$expr: {
											$and: [
												{
													$eq: ['$studentId', '$$studId'],
												},
												{
													$eq: ['$deleted', false],
												},
											],
										},
									},
								},
							],
							as: 'fee',
						},
					},
					{
						$lookup: {
							from: 'previousfeesbalances',
							localField: '_id',
							foreignField: 'studentId',
							as: 'prev',
						},
					},
					{
						$project: {
							name: 1,
							profile_image: 1,
							className: {
								$first: '$section.className',
							},
							totalFees: {
								$sum: {
									$concatArrays: ['$fee.totalAmount', '$prev.totalAmount'],
								},
							},
						},
					},
				],
				totalCount: [
					{
						$count: 'count',
					},
				],
			},
		},
	];

	const [{ students, totalCount }] = await Students.aggregate(
		studAggregate
	).toArray();

	if (!students.length)
		return next(new ErrorResponse('No Students Found', 404));

	const disAggregate = [
		{
			$match: {
				studentId: {
					$in: students.map(({ _id }) => mongoose.Types.ObjectId(_id)),
				},
				$expr: {
					$gt: [
						{
							$size: '$discounts',
						},
						0,
					],
				},
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
				'discounts.status': 'Approved',
			},
		},
		{
			$group: {
				_id: {
					stud: '$studentId',
					discountId: '$discounts.discountId',
				},
				amount: {
					$sum: '$discounts.discountAmount',
				},
			},
		},
		{
			$lookup: {
				from: 'discountcategories',
				localField: '_id.discountId',
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
			$group: {
				_id: '$_id.stud',
				discountList: {
					$push: {
						_id: '$_id.discountId',
						name: '$discount.name',
						amount: '$amount',
					},
				},
			},
		},
	];

	const discountData = await FeeInstallment.aggregate(disAggregate);

	if (discountData.length) {
		students.forEach(student => {
			const matchedDiscount = discountData.find(
				({ _id }) => _id.toString() === student._id.toString()
			);
			if (matchedDiscount) {
				student.discounts = matchedDiscount.discountList;
			}
		});
	}

	res
		.status(200)
		.json(
			SuccessResponse(students, totalCount[0].count, 'Fetched Successfully')
		);
});

const getDiscountSummary = catchAsync(async (req, res, next) => {
	const { school_id } = req.user;
	const { sectionId } = req.query;

	if (sectionId) {
		const classData = await ClassDiscount.find(
			{
				'section.id': sectionId,
			},
			{
				_id: 0,
				section: 1,
				discount: 1,
				totalApprovedAmount: 1,
			}
		).lean();

		if (!classData.length) return next(new ErrorResponse('No Data Found', 404));

		const discountCount = new Set(classData.map(doc => doc.discount.id));

		const totalAmount = classData.reduce(
			(total, doc) => total + doc.totalApprovedAmount,
			0
		);

		const response = {
			totalAmount,
			totalDiscount: discountCount.size,
		};

		return res.json(SuccessResponse(response, 1, 'Fetched Successfully'));
	}

	const discountData = await DiscountCategory.find(
		{ schoolId: school_id },
		{
			totalBudget: 1,
			budgetAlloted: {
				$subtract: ['$totalBudget', '$budgetRemaining'],
			},
			budgetRemaining: 1,
		}
	).lean();

	if (!discountData.length) {
		return next(new ErrorResponse('No Discount Found', 404));
	}

	const responseObj = discountData.reduce(
		(acc, { totalBudget, budgetAlloted, budgetRemaining }) => {
			acc.totalBudgetAlloted += totalBudget;
			acc.totalDiscount += budgetAlloted;
			acc.totalBudgetRemaining += budgetRemaining;
			return acc;
		},
		{
			totalBudgetAlloted: 0,
			totalDiscount: 0,
			totalBudgetRemaining: 0,
		}
	);

	res.json(SuccessResponse(responseObj, 1, 'Fetched Successfully'));
});

const getDiscountGraph = catchAsync(async (req, res, next) => {
	const { school_id } = req.user;

	const discountData = await DiscountCategory.find(
		{
			schoolId: school_id,
		},
		{
			_id: 1,
			name: 1,
			amount: {
				$subtract: ['$totalBudget', '$budgetRemaining'],
			},
		}
	).lean();

	if (!discountData.length)
		return next(new ErrorResponse('No Discount Found', 404));

	res.json(
		SuccessResponse(discountData, discountData.length, 'Fetched Successfully')
	);
});

const getGraphBySection = catchAsync(async (req, res, next) => {
	const { school_id } = req.user;

	const aggregate = [
		{
			$match: {
				schoolId: mongoose.Types.ObjectId(school_id),
			},
		},
		{
			$group: {
				_id: '$section',
				amount: {
					$sum: '$totalApprovedAmount',
				},
			},
		},
		{
			$project: {
				_id: '$_id.id',
				name: '$_id.name',
				amount: 1,
			},
		},
	];

	const discountData = await ClassDiscount.aggregate(aggregate);

	if (!discountData.length)
		return next(new ErrorResponse('No Discount Found', 404));

	res.json(
		SuccessResponse(discountData, discountData.length, 'Fetched Successfully')
	);
});

const getSectionWiseDiscount = catchAsync(async (req, res, next) => {
	const { school_id } = req.user;
	const { page = 0, limit = 5 } = req.query;

	const aggregate = [
		{
			$match: {
				schoolId: mongoose.Types.ObjectId(school_id),
			},
		},
		{
			$group: {
				_id: '$section',
				totalDiscount: {
					$sum: '$totalApprovedAmount',
				},
				discountCategories: {
					$push: {
						_id: '$discount.id',
						name: '$discount.name',
						amount: '$totalApprovedAmount',
					},
				},
			},
		},
		{
			$facet: {
				data: [
					{
						$skip: parseInt(page * limit),
					},
					{
						$limit: parseInt(limit),
					},
					{
						$project: {
							_id: '$_id.id',
							name: '$_id.name',
							totalDiscount: 1,
							discountCategories: 1,
						},
					},
				],
				totalCount: [
					{
						$count: 'count',
					},
				],
			},
		},
	];

	const [{ data, totalCount }] = await ClassDiscount.aggregate(aggregate);

	if (!totalCount.length)
		return next(new ErrorResponse('No Discount Found', 404));

	res.json(SuccessResponse(data, totalCount[0].count, 'Fetched Successfully'));
});

/**
 * {
  "_id": {
    "$oid": "64ed5e608a293583962a2110"
  },
  "schoolId": {
    "$oid": "62849114bb0c8eeb5104737f"
  },

  "categoryId": {
    "$oid": "64565a7923b727b3b7d8975e"
  },
  "feeStructureId": {
    "$oid": "6456624123b727b3b7d8982c"
  },
  "discountId": {
    "$oid": "6458790623b727b3b7d8ad5c"
  },
  "totalFeesAmount": 22400,
  "feeDetails": [
    {
      "feeType": {
        "id": {
          "$oid": "64565aaf23b727b3b7d8976b"
        },
        "name": "Term Fee"
      },
      "amount": 22400,
      "isPercentage": false,
      "value": 1866,
      "discountAmount": 1866,
      "breakdown": [
        {
          "date": {
            "$date": "2023-05-01T00:00:00.000Z"
          },
          "amount": 5600,
          "value": 466.5
        },
        {
          "date": {
            "$date": "2023-08-01T00:00:00.000Z"
          },
          "amount": 5600,
          "value": 466.5
        },
        {
          "date": {
            "$date": "2023-11-01T00:00:00.000Z"
          },
          "amount": 5600,
          "value": 466.5
        },
        {
          "date": {
            "$date": "2024-02-01T00:00:00.000Z"
          },
          "amount": 5600,
          "value": 466.5
        }
      ]
    }
  ]
}
 */
const createDiscountTemplate = catchAsync(async (req, res, next) => {
	const requiredFields = [
		'schoolId',
		'categoryId',
		'feeStructureId',
		'discountId',
		'feeDetails',
		'totalFeesAmount',
	];

	const missingFields = requiredFields.filter(field => !(field in req.body));
	if (missingFields.length > 0) {
		return next(new ErrorResponse('Please Provide All Required Fields', 422));
	}

	const {
		schoolId,
		categoryId,
		feeStructureId,
		discountId,
		feeDetails,
		totalFeesAmount,
	} = req.body;

	const createObj = {
		schoolId,
		categoryId,
		feeStructureId,
		discountId,
		totalFeesAmount,
		feeDetails,
	};

	const createdTemplate = await DiscountStructure.create(createObj);

	res.json(SuccessResponse(createdTemplate, 1, 'Created Successfully'));
});

module.exports = {
	getStudentForApproval,
	addStudentToDiscount,
	getSectionWiseDiscount,
	getDiscountGraph,
	createDiscountTemplate,
	getDiscountSummary,
	revokeStudentDiscount,
	getGraphBySection,
	approveStudentDiscount,
	createDiscountCategory,
	getStudentsByFilter,
	discountReport,
	getDiscountCategory,
	getDiscountCategoryById,
	getStudentsByStructure,
	updateDiscountCategory,
	deleteDiscountCategory,
	mapDiscountCategory,
	getDiscountCategoryByClass,
	getStudentsWithDiscount,
	getDiscountBySchool,
	addAttachment,
	getSectionDiscount,
};
