const mongoose = require('mongoose');
const DonorModel = require('../models/donor');
const ErrorResponse = require('../utils/errorResponse');
const Donations = require('../models/donation');
const catchAsync = require('../utils/catchAsync');
const SuccessResponse = require('../utils/successResponse');

// CREATE
exports.create = async (req, res, next) => {
	const {
		name,
		email,
		address,
		contactNumber,
		bank,
		schoolId,
		profileImage,
		IFSC,
		accountNumber,
		accountType,
		donorType,
		studentList,
	} = req.body;
	if (
		!name ||
		!bank ||
		!schoolId ||
		!IFSC ||
		!accountNumber ||
		!accountType ||
		!donorType
	) {
		return next(new ErrorResponse('All Fields are Mandatory', 422));
	}

	const isExist = await DonorModel.findOne({ IFSC, accountNumber, schoolId });
	if (isExist) {
		return next(new ErrorResponse('Donor Already Exist', 400));
	}

	let newDonor;
	try {
		newDonor = await DonorModel.create({
			...req.body,
			studentList: studentList ?? [],
		});
	} catch (error) {
		console.log('error', error);
		return next(new ErrorResponse('Something Went Wrong', 500));
	}
	return res
		.status(201)
		.json(SuccessResponse(newDonor, 1, 'Created Successfully'));
};

// GET
exports.get = catchAsync(async (req, res, next) => {
	const { page = null, limit = null, schoolId } = req.query;

	const payload = {};
	if (schoolId) {
		payload.schoolId = mongoose.Types.ObjectId(schoolId);
	}
	const aggregate = [
		{ $match: payload },
		{
			$sort: {
				createdAt: -1,
			},
		},
	];
	const pagination = [{ $skip: +page * +limit }, { $limit: +limit }];
	if (page && limit) {
		aggregate.push(...pagination);
	}
	const donorList = await DonorModel.aggregate([
		{
			$facet: {
				data: aggregate,
				count: [{ $match: payload }, { $count: 'count' }],
			},
		},
	]);
	const { data, count } = donorList[0];

	if (count.length === 0) {
		return next(new ErrorResponse('No Donor Found', 404));
	}
	res
		.status(200)
		.json(SuccessResponse(data, count[0].count, 'Fetched Successfully'));
});

// READ
exports.read = catchAsync(async (req, res, next) => {
	const { id } = req.params;
	const donorList = await DonorModel.findOne({ _id: id });
	if (donorList === null) {
		return next(new ErrorResponse('Donor Not Found', 404));
	}
	res.status(200).json(SuccessResponse(donorList, 1, 'Fetched Successfully'));
});

// UPDATE
exports.update = catchAsync(async (req, res, next) => {
	const { id } = req.params;
	const donor = await DonorModel.findOneAndUpdate({ _id: id }, req.body);
	if (donor === null) {
		return next(new ErrorResponse('Donor Not Found', 404));
	}
	res.status(200).json(SuccessResponse(donor, 1, 'Updated Successfully'));
});

// update student list
exports.updateStudentList = catchAsync(async (req, res, next) => {
	const { id, studentList } = req.body;

	// calculate total amount
	const totalAmount = studentList.reduce((acc, obj) => acc + obj.amount, 0);
	// update total amount
	await DonorModel.findOneAndUpdate(
		{ _id: id },
		{
			$inc: {
				totalAmount, // Assuming you want to increment the "totalAmount"
			},
			$push: {
				studentList: { $each: studentList }, // Push each student from the "studentList" array
			},
		}
	);

	res.status(200).json(SuccessResponse(null, 1, 'Updated Successfully'));
});

// DELETE
exports.donorDelete = catchAsync(async (req, res, next) => {
	const { id } = req.params;

	const hasDonated = await Donations.findOne({ donorId: id });

	if (hasDonated) {
		return next(new ErrorResponse('Donor Has Donated, Cannot Delete', 400));
	}

	const donor = await DonorModel.findOneAndDelete({
		_id: id,
	});
	if (donor === null) {
		return next(new ErrorResponse('Donor Not Found', 404));
	}
	res.status(200).json(SuccessResponse(null, 1, 'Deleted Successfully'));
});

exports.getDonations = catchAsync(async (req, res, next) => {
	const { id } = req.params;
	let { page = 0, limit = 5 } = req.query;

	page = +page;
	limit = +limit;

	const donations = await Donations.aggregate([
		{
			$facet: {
				data: [
					{
						$match: {
							donorId: mongoose.Types.ObjectId(id),
						},
					},
					{
						$sort: {
							createdAt: -1,
						},
					},
					{
						$skip: page * limit,
					},
					{
						$limit: limit,
					},
					{
						$lookup: {
							from: 'students',
							let: {
								studentId: '$studentId',
							},
							pipeline: [
								{
									$match: {
										$expr: {
											$eq: ['$_id', '$$studentId'],
										},
									},
								},
								{
									$project: {
										_id: 1,
										name: 1,
										admission_no: 1,
									},
								},
							],
							as: 'studentId',
						},
					},
					{
						$lookup: {
							from: 'sections',
							let: {
								sectionId: '$sectionId',
							},
							pipeline: [
								{
									$match: {
										$expr: {
											$eq: ['$_id', '$$sectionId'],
										},
									},
								},
								{
									$project: {
										_id: 1,
										name: 1,
										className: 1,
									},
								},
							],
							as: 'sectionId',
						},
					},
					{
						$project: {
							_id: 1,
							amount: 1,
							date: 1,
							paymentType: 1,
							studentId: {
								$arrayElemAt: ['$studentId', 0],
							},
							sectionId: {
								$arrayElemAt: ['$sectionId', 0],
							},
							admission_no: {
								$arrayElemAt: ['$studentId.admission_no', 0],
							},
						},
					},
				],
				count: [
					{
						$match: {
							donorId: mongoose.Types.ObjectId(id),
						},
					},
					{
						$count: 'count',
					},
				],
			},
		},
	]);
	const { data, count } = donations[0];
	if (count.length === 0) {
		return next(new ErrorResponse('No Donations Found', 404));
	}
	res
		.status(200)
		.json(SuccessResponse(data, count[0].count, 'Fetched Successfully'));
});

exports.getReport = catchAsync(async (req, res, next) => {
	const { schoolId } = req.params;
	const [donor, donations] = await Promise.all([
		await DonorModel.aggregate([
			{
				$match: {
					schoolId: mongoose.Types.ObjectId(schoolId),
				},
			},
			{
				$sort: {
					totalAmount: -1,
				},
			},
			{
				$group: {
					_id: null,
					totalDonations: {
						$sum: '$totalAmount',
					},
					highestDonation: {
						$first: '$totalAmount',
					},
					highestDonor: {
						$first: '$$ROOT',
					},
				},
			},
		]),
		await Donations.aggregate([
			{
				$match: {
					schoolId: mongoose.Types.ObjectId(schoolId),
				},
			},
			{
				$group: {
					_id: '$sectionId',
					totalDonations: {
						$sum: '$amount',
					},
				},
			},
			{
				$sort: {
					totalDonations: -1,
				},
			},
			{
				$limit: 1,
			},
			{
				$lookup: {
					from: 'sections',
					foreignField: '_id',
					localField: '_id',
					as: 'sectionId',
				},
			},
			{
				$unwind: '$sectionId',
			},
			{
				$project: {
					_id: 0,
					className: '$sectionId.className',
					totalDonations: 1,
				},
			},
		]),
	]);
	const responseObj = {
		totalDonations: donor[0]?.totalDonations || 0,
		highestDonation: {
			amount: donations[0]?.totalDonations || 0,
			className: donations[0]?.className || null,
		},
		highestDonor: donor[0]?.highestDonor || null,
	};
	// if (donor.length === 0) {
	// 	return next(new ErrorResponse('No Donations Found', 404));
	// }
	res.status(200).json(SuccessResponse(responseObj, 1, 'Fetched Successfully'));
});
