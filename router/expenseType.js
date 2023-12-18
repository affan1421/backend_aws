const express = require('express');

const router = express.Router();
const {
	getTypes,
	create,
	read,
	update,
	expenseDelete,
	getExpenseTypesBySchool,
} = require('../controller/expenseType');

router.get('/', getTypes).post('/', create);
router.get('/byschool', getExpenseTypesBySchool);

router.get('/:id', read).put('/:id', update).delete('/:id', expenseDelete);

module.exports = router;
