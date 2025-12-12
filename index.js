const express = require('express');

const cors = require('cors');
const mongoose = require('mongoose');
const SUGGESTED_TOPICS = require('./topics');
const { User, Feed } = require('./models');
const { doDailyTask } = require('./dailyTask');
const { generateFeed } = require('./feedGenerator');
require('dotenv').config();
const { clerkMiddleware, requireAuth, clerkClient } = require('@clerk/express');



const app = express();
const port = 3000;



app.use(cors({
  origin: ['http://localhost:5173', 'http://127.0.0.1:5173', 'https://www.smalltalk.fun', 'https://small-fe.vercel..vercel.app'],
  methods: 'GET,POST,PUT,DELETE,PATCH,HEAD',
  credentials: true,
}));


app.use(express.json());
app.use(clerkMiddleware())

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/smalltalk_db';

mongoose.connect(MONGODB_URI)
  .then(() => console.log('connected to mongodb!'))
  .catch((err) => console.error('mongdb connection error:', err));







app.get('/topics', requireAuth(), async (req, res) => {
  const clerkId = req.auth.userId;
  const currUser = await clerkClient.users.getUser(clerkId);
  const currEmail = currUser.emailAddresses[0].emailAddress;

  const currentUser = await User.findOne({
    clerkId: clerkId
  });

  if (!currentUser) {
    const currentUser = await createUser(currEmail, clerkId);
  }

  const preferredTopics = currentUser.preferredTopics;
  const suggestedTopics = SUGGESTED_TOPICS.filter(item => {
    return !preferredTopics.includes(item);
  });


  res.json({ suggestedTopics: suggestedTopics, preferredTopics: preferredTopics });
});


app.get('/home', requireAuth(), async (req, res) => {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date(todayStart);
  todayEnd.setUTCDate(todayStart.getUTCDate() + 1);

  const feed = { "ideas": [] };
  const todayFeed = await Feed.findOne({
    clerkId: req.auth.userId,
    date: {
      $gte: todayStart,
      $lt: todayEnd,
    }
  }).sort({ date: -1 }).exec();

  if (!todayFeed) {
    const currentUser = await User.findOne({
      clerkId: req.auth.userId
    });

    const response = await generateFeed(currentUser.preferredTopics, currentUser.feedback, currentUser.likes, currentUser.dislikes);
    feed.ideas = response.ideas;
    const newFeed = new Feed({
      clerkId: req.auth.userId,
      ideas: response.ideas,
    });
    newFeed.save();
    feed.feedId = newFeed._id;
  } else {
    feed.ideas = todayFeed.ideas;
    feed.feedId = todayFeed._id;
  }
  res.json(feed);
});


app.get('/regen', requireAuth(), async (req, res) => {
  const currentUser = await User.findOne({
    clerkId: req.auth.userId
  });

  const feed = await generateFeed(currentUser.preferredTopics, currentUser.feedback, currentUser.likes, currentUser.dislikes);
  const newFeed = new Feed({
    clerkId: req.auth.userId,
    ideas: feed.ideas,
  });
  newFeed.save();
  feed.feedId = newFeed._id;
  res.json(feed);

})

app.post('/feedback', requireAuth(), async (req, res) => {
  const updatedUser = await User.findOneAndUpdate(
    { clerkId: req.auth.userId },
    { $push: { feedback: req.body.feedback } }
  );
})

const createUser = async (email, clerkId) => {
  const newUser = new User({
    email: email,
    clerkId: clerkId,
    preferredTopics: ["Tech", "Sports", "Weather"],
  });
  newUser.save();
};

app.patch('/topics', requireAuth(), async (req, res) => {
  const updatedTopics = req.body;
  const updatedUser = await User.findOneAndUpdate(
    { clerkId: req.auth.userId },
    { $set: { preferredTopics: updatedTopics } }
  );
  res.json(updatedUser);

});


app.patch('/idealike', requireAuth(), async (req, res) => {
  const path = `ideas.${req.body.index}.liked`;
  const updatedFeed = await Feed.findOneAndUpdate(
    {
      _id: req.body.feedId,
      clerkId: req.auth.userId,
    },
    { $set: { [path]: req.body.liked } }
  );

  const idea = updatedFeed.ideas[req.body.index];
  const ideaString = `Title: ${idea.title} #
    Description: ${idea.description} `

  switch (req.body.liked) {
    case "YES":
      await User.findOneAndUpdate(
        { clerkId: req.auth.userId },
        { $push: { likes: ideaString } }
      );
      break;
    case "NO":
      await User.findOneAndUpdate(
        { clerkId: req.auth.userId },
        { $push: { dislikes: ideaString } }
      );
      break;
    case "UNFILLED":
      await User.findOneAndUpdate(
        { clerkId: req.auth.userId },
        {
          $pull: {
            likes: ideaString,
            dislikes: ideaString
          }
        }
      );
      break;
  }
  res.json(updatedFeed);

});


app.post('/daily', async (req, res) => {
  if (req.headers['x-cron-key'] !== process.env.CRON_KEY)
    return res.status(401).send('Unauthorized');
  doDailyTask();
  res.send('OK');
});


app.listen(3000, () => console.log("Backend running at http://localhost:3000"));

