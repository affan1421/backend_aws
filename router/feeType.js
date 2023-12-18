const express = require('express');

const router = express.Router();
const {
	getTypes,
	create,
	read,
	update,
	feeDelete,
} = require('../controller/feeType');

// GET
router.get('/', getTypes);

// CREATE
router.post('/', create);

// READ
router.get('/:id', read);

// UPDATE
router.put('/:id', update);

// DELETE
router.delete('/:id', feeDelete);

module.exports = router;
