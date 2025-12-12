const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
    email: { type: String, required: true, unique: true },
    clerkId: String,
    preferredTopics: [{ type: String, default: [] }],
    feedback: [{ type: String, default: [] }],
    likes: [{ type: String, default: [] }],
    dislikes: [{ type: String, default: [] }],
    created_at: { type: Date, default: Date.now },
});

const User = mongoose.model('User', userSchema);

const feedSchema = new mongoose.Schema({
    clerkId: String,
    ideas: [{
        title: String,
        description: String,
        liked: String,
    }],
    date: { type: Date, required: true, default: Date.now },
})

const Feed = mongoose.model('Feed', feedSchema);

module.exports = { User, Feed };
