const mongoose = require('mongoose');
const { User, Feed } = require('./models');
const { sendEmail, formatEmailHtml } = require('./emailService');
const { generateFeed } = require('./feedGenerator');
require('dotenv').config();


const doDailyTask = async () => {
    try {
        const query = User.find({});
        const cursor = query.cursor();

        for await (const curruser of cursor) {
            console.log(`Processing user _id: ${curruser._id} | email: ${curruser.email}`);
            const feed = await generateFeed(curruser.preferredTopics, curruser.feedback, curruser.likes, curruser.dislikes);
            const newFeed = new Feed({
                clerkId: curruser.clerkId,
                ideas: feed.ideas,
            });
            await newFeed.save();
            await sendEmail(curruser.email, formatEmailHtml(feed.ideas));

        }
    } catch (error) {
        console.error("An error occurred:", error);
    };
}

if (require.main === module) {
    const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/smalltalk_db';
    mongoose.connect(MONGODB_URI)
        .then(() => {
            console.log('Connected to MongoDB');
            return doDailyTask();
        })
        .then(() => {
            console.log('Daily task completed');
            process.exit(0);
        })
        .catch(err => {
            console.error('Error running daily task:', err);
            process.exit(1);
        });
}

module.exports = { doDailyTask };
