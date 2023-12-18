const express = require('express');

const router = express.Router();
const {
	getExpenses,
	create,
	read,
	update,
	expenseDelete,
	totalExpenses,
	totalExpenseFilter,
	getExcel,
	getNewDashboardData,
	expensesList,
} = require('../controller/expense');

router.get('/excel', getExcel);

router.post('/getAll', getExpenses).post('/', create);
router.post('/totalExpense', totalExpenses);
router.post('/totalExpenseFilter', totalExpenseFilter);
router.post('/expenseList', expensesList);

// Expense Dashboard
router.get('/dashboard', getNewDashboardData);

router.get('/:id', read).put('/:id', update).delete('/:id', expenseDelete);

module.exports = router;
