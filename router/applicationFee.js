const express = require('express');

const router = express.Router();
const {
	getAllApplicationFees,
	getApplicationFeeById,
	createApplicationFee,
	updateApplicationFee,
	deleteApplicationFee,
	updategender,
} = require('../controller/applicationFee');

// GET all application fees
router.get('/', getAllApplicationFees);

// GET a single application fee by ID
router.get('/:id', getApplicationFeeById);

// CREATE a new application fee record
router.post('/', createApplicationFee);

router.post('/bulk', updategender);

// UPDATE an existing application fee record
router.put('/:id', updateApplicationFee);

// DELETE an application fee record by ID
router.delete('/:id', deleteApplicationFee);

module.exports = router;
