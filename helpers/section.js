const mongoose = require('mongoose');

const Sections = mongoose.connection.db.collection('sections');

const getSections = async school_id => {
	const sectionList = await Sections.find({
		school: mongoose.Types.ObjectId(school_id),
	})
		.project({ name: 1, className: 1 })
		.toArray();
	return sectionList.reduce((acc, curr) => {
		acc[curr._id] = curr;
		return acc;
	}, {});
};

module.exports = getSections;
