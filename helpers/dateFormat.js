const moment = require('moment');
// START DATE

const getStartDate = (date, type) =>
	date
		? moment(date, 'DD/MM/YYYY').startOf('day').toDate()
		: moment().startOf(type).toDate();
// END DATE
const getEndDate = (date, type) =>
	date
		? moment(date, 'DD/MM/YYYY').endOf('day').toDate()
		: moment().endOf(type).toDate();

// PREV START DATE
const getPrevStartDate = (date, type, flag) =>
	date
		? moment(date, 'DD/MM/YYYY').subtract(1, flag).startOf('day').toDate()
		: moment().subtract(1, flag).startOf(type).toDate();
// PREV END DATE
const getPrevEndDate = (date, type, flag) =>
	date
		? moment(date, 'DD/MM/YYYY').subtract(1, flag).endOf('day').toDate()
		: moment().subtract(1, flag).endOf(type).toDate();

module.exports = {
	getStartDate,
	getEndDate,
	getPrevStartDate,
	getPrevEndDate,
};
