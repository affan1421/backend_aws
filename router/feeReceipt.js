const express = require('express');

const router = express.Router();
const {
	getFeeReceipt,
	createReceipt,
	getFeeReceiptSummary,
	getFeeReceiptById,
	getDashboardData,
	receiptByStudentId,
	UpdateConfirmations,
	getExcel,
	GetConfirmations,
	cancelReceipt,
} = require('../controller/feeReceipt');

router.get('/dashboard', getDashboardData);

router.post('/confirmations', GetConfirmations);

router.post('/:id/confirmations', UpdateConfirmations);

// Update API to accept username and sectionId for left student as unique value.
router.post('/student', receiptByStudentId);

router.get('/excel', getExcel);
router.get('/', getFeeReceipt);

router.get('/summary', getFeeReceiptSummary);

router.get('/:id', getFeeReceiptById);

router.post('/:id/cancellation', cancelReceipt);

// Miscelleneous Receipt
router.post('/', createReceipt);

module.exports = router;
