const mongoose = require('mongoose');
const moment = require('moment');
const { Readable } = require('stream');
const csv = require('fast-csv');

const ApplicationFee = require('../models/applicationFee');
const AcademicYear = require('../models/academicYear');
const FeeReceipt = require('../models/feeReceipt');
const SuccessResponse = require('../utils/successResponse');
const ErrorResponse = require('../utils/errorResponse');
const catchAsync = require('../utils/catchAsync');
const FeeType = require('../models/feeType');

const School = mongoose.connection.db.collection('schools');

// Create a new application fee record
const createApplicationFee = async (req, res, next) => {
	try {
		const {
			studentName,
			classId,
			sectionId,
			className,
			parentName,
			parentType,
			phoneNumber,
			gender,
			course = '',
			amount,
			schoolId,
			paymentMode = 'CASH',
			createdBy,
		} = req.body;

		if (
			!studentName ||
			!sectionId ||
			!classId ||
			!className ||
			!parentName ||
			!parentType ||
			!gender ||
			!phoneNumber ||
			!amount ||
			!schoolId ||
			!createdBy
		) {
			return next(new ErrorResponse('Please Provide All Field', 422));
		}

		const classOnly = className.split(' - ')[0];
		const sectionName = className.split(' - ')[1];

		const [school, academicYear, foundForm, lastReceipt] = await Promise.all([
			School.findOne(
				{ _id: mongoose.Types.ObjectId(schoolId) },
				{ schoolName: 1, address: 1 }
			),
			AcademicYear.findOne({ isActive: true, schoolId }, { name: 1 }),
			ApplicationFee.findOne({ schoolId, academicYearId: { $exists: true } }),
			FeeReceipt.findOne({ 'school.schoolId': schoolId })
				.sort({ createdAt: -1 })
				.lean(),
		]);

		let feeTypeId = null;

		if (!foundForm) {
			const feeType = await FeeType.create({
				_id: mongoose.Types.ObjectId(),
				feeType: 'Application Fee',
				accountType: 'Revenue',
				schoolId,
				description: 'Application Fee',
				isMisc: true,
				feeCategory: 'APPLICATION',
			});
			feeTypeId = feeType._id;
		} else {
			feeTypeId = foundForm.feeTypeId;
		}
		const { _id: academicYearId, name: academicYearName } = academicYear;
		const { schoolName, address } = school;

		const receipt_id = mongoose.Types.ObjectId();
		const formattedDate = moment().format('DDMMYY');
		const newCount = lastReceipt
			? (parseInt(lastReceipt.receiptId.slice(-5)) + 1)
					.toString()
					.padStart(5, '0')
			: '00001';
		const receiptId = `AP${formattedDate}${newCount}`;
		const payload = {
			studentName,
			classId,
			sectionId,
			className,
			parentName,
			parentType,
			phoneNumber,
			course,
			gender,
			amount,
			schoolId,
			academicYearId: academicYear._id,
			feeTypeId,
			receiptId: receipt_id,
		};

		let applicationFee = await ApplicationFee.create(payload);
		applicationFee = JSON.parse(JSON.stringify(applicationFee));

		const receiptPayload = {
			_id: receipt_id,
			student: {
				name: studentName,
				class: {
					classId,
					name: classOnly,
				},
				section: {
					sectionId,
					name: sectionName,
				},
			},
			parent: {
				name: parentName,
				mobile: phoneNumber,
			},
			school: {
				name: schoolName,
				address,
				schoolId,
			},
			receiptType: 'APPLICATION',
			academicYear: {
				name: academicYearName,
				academicYearId,
			},
			totalAmount: amount,
			paidAmount: amount,
			dueAmount: 0,
			receiptId,
			issueDate: new Date(),
			payment: {
				method: paymentMode,
			},
			items: [
				{
					feeTypeId,
					netAmount: amount,
					paidAmount: amount,
				},
			],
			createdBy,
		};

		let receipt = await FeeReceipt.create(receiptPayload);
		receipt = JSON.parse(JSON.stringify(receipt));
		receipt.items[0].feeTypeId = {
			_id: feeTypeId,
			feeType: 'Application Fee',
		};
		res.status(201).json(
			SuccessResponse(
				{
					...applicationFee,
					receipt: {
						...receipt,
					},
				},
				1,
				'Created Successfully'
			)
		);
	} catch (error) {
		console.log(error);
		return next(new ErrorResponse('Something went wrong', 500));
	}
};

const updategender = async (req, res, next) => {
	try {
		const { file } = req.files;
		Readable.from(file.data)
			.pipe(
				csv.parse({
					headers: true,
					ignoreEmpty: true,
				})
			)
			.on('error', error => console.error(error))
			.on('data', async row => {
				const { _id, Gender } = row;
				const applicationFee = await ApplicationFee.findByIdAndUpdate(
					mongoose.Types.ObjectId(_id),
					{
						$set: {
							gender: Gender,
						},
					}
				);
			});
		res.status(200).json({ success: true, message: 'Updated Successfully' });
		// read the file
	} catch (error) {
		console.log(error);
	}

	// Call the function to update documents
};

// Get all application fee records
const getAllApplicationFees = catchAsync(async (req, res, next) => {
	let { schoolId, classId, searchTerm = null, page = 0, limit = 5 } = req.query;
	page = +page;
	limit = +limit;
	const payload = {};
	const aggregate = [
		{ $match: payload },
		{ $skip: page * limit },
		{ $limit: limit },
	];
	if (schoolId) {
		payload.schoolId = mongoose.Types.ObjectId(schoolId);
	}
	if (classId) {
		payload.classId = mongoose.Types.ObjectId(classId);
	}
	if (searchTerm) {
		payload.studentName = { $regex: searchTerm, $options: 'i' };
	}
	// find active academic year
	const { _id: academicYearId } = await AcademicYear.findOne({
		isActive: true,
		schoolId,
	});
	payload.academicYearId = mongoose.Types.ObjectId(academicYearId);

	const applicationFee = await ApplicationFee.aggregate([
		{
			$facet: {
				data: aggregate,
				count: [{ $match: payload }, { $count: 'count' }],
			},
		},
	]);
	const { data, count } = applicationFee[0];

	if (count.length === 0) {
		return next(new ErrorResponse('Application Fee Not Found', 404));
	}
	res
		.status(200)
		.json(SuccessResponse(data, count[0].count, 'Fetched Successfully'));
});

// Get a single application fee record by ID
const getApplicationFeeById = catchAsync(async (req, res, next) => {
	const { id } = req.params;
	const applicationFee = await ApplicationFee.findById(id);

	if (!applicationFee) {
		return next(new ErrorResponse('Application Fee Not Found', 404));
	}

	res.status(200).json({ success: true, data: applicationFee });
});

// Update an application fee record
const updateApplicationFee = async (req, res, next) => {
	try {
		const { id } = req.params;
		const {
			studentName,
			classId,
			parentName,
			phoneNumber,
			course,
			amount,
			school,
			academicYear,
			receiptId,
			issueDate,
			paymentMode,
			className,
		} = req.body;

		const applicationFee = await ApplicationFee.findByIdAndUpdate(
			id,
			{
				studentName,
				classId,
				className,
				parentName,
				phoneNumber,
				course,
				amount,
				school,
				academicYear,
				receiptId,
				issueDate,
				paymentMode,
			},
			{ new: true }
		);

		if (!applicationFee) {
			return next(new ErrorResponse('Application Fee Not Found', 404));
		}

		res
			.status(200)
			.json(SuccessResponse(applicationFee, 1, 'Updated Successfully'));
	} catch (error) {
		console.log(error);
		return next(new ErrorResponse('Something went wrong', 500));
	}
};

// Delete an application fee record
const deleteApplicationFee = async (req, res, next) => {
	try {
		const { id } = req.params;
		const applicationFee = await ApplicationFee.findByIdAndDelete(id);

		if (!applicationFee) {
			return next({ success: false, message: 'Record not found' });
		}

		res.status(200).json(SuccessResponse(null, 1, 'Deleted Successfully'));
	} catch (error) {
		console.log(error);
		return next(new ErrorResponse('Something went wrong', 500));
	}
};

module.exports = {
	createApplicationFee,
	getAllApplicationFees,
	getApplicationFeeById,
	updateApplicationFee,
	deleteApplicationFee,
	updategender,
};
