const express = require('express');
const openai = require('openai');
const cors = require('cors');
const mongoose = require('mongoose');
const SUGGESTED_TOPICS = require('./topics');
require('dotenv').config();
const { clerkMiddleware, requireAuth, clerkClient } = require('@clerk/express');
const { Resend } = require('resend');


const app = express();
const port = 3000;
const client = new openai({
  apiKey: process.env.OPENAI_API_KEY
});


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

const resend = new Resend();

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


const generateFeed = async (preferredTopics, feedback, likes, dislikes) => {

  const textFeedback = toPlainTextBulletedList(feedback);
  const textLikes = toPlainTextBulletedList(likes);
  const textDislikes = toPlainTextBulletedList(dislikes);

  const response = await client.responses.create({
    model: "gpt-5-mini",
    input: [
      {
        "role": "developer",
        "content": [
          {
            "type": "input_text",
            "text": "You are creative conversation opener generator that runs every morning. Suggest five daily creative, engaging and fresh conversation openers that can be used in a variety of casual social situations. Each opener should be appropriate for general adult audiences and not assume prior familiarity between speakers. The conversation openers should take into account latest news, events, weather and other trending topics relevant to the user.  The topics should be very casual, potentially humorous  and appropriate for quick casual social situations.\n\n"
          }
        ]
      },
      {
        "role": "user",
        "content": [
          {
            "type": "input_text",
            "text": `The user lives in London. Here are their preferred topics: ${preferredTopics.join(', ')}. 
            Take into account that the user has previously liked the following ideas: ${textLikes} 

            Take into account that the user has also previously disliked the following ideas:${textDislikes}

            Also take into account the direct feedback below provided by the user: ${textFeedback} 
            `
          }
        ]
      }
    ],
    text: {
      "format": {
        "type": "json_schema",
        "name": "idea_list",
        "strict": true,
        "schema": {
          "type": "object",
          "properties": {
            "ideas": {
              "type": "array",
              "description": "A list of five ideas.",
              "items": {
                "type": "object",
                "properties": {
                  "title": {
                    "type": "string",
                    "description": "Short headline for the idea.",
                    "minLength": 1
                  },
                  "description": {
                    "type": "string",
                    "description": "A description of the idea.",
                    "minLength": 1
                  }
                },
                "required": [
                  "title",
                  "description"
                ],
                "additionalProperties": false
              },
              "minItems": 5,
              "maxItems": 5
            }
          },
          "required": [
            "ideas"
          ],
          "additionalProperties": false
        }
      },
      "verbosity": "medium"
    },
    reasoning: {
      "effort": "low",
      "summary": "auto"
    },
    tools: [
      {
        "type": "web_search",
        "filters": null,
        "search_context_size": "medium",
        "user_location": {
          "type": "approximate",
          "city": null,
          "country": "GB",
          "region": null,
          "timezone": null
        }
      }
    ],
    store: true,
    include: [
      "reasoning.encrypted_content",
      "web_search_call.action.sources"
    ]
  });
  const feed = JSON.parse(response.output_text);
  feed.ideas.forEach(idea => {
    idea.description = removeOpenAICitations(idea.description);
    idea.liked = "UNFILLED";
  });
  return feed;
}


function toPlainTextBulletedList(arr) {
  // 1. Use map() to prefix each item with a bullet point and a space
  const bulletedItems = arr.map(item => `* ${item}`);

  // 2. Join the items with a newline character
  return bulletedItems.join('\n');
}

function removeOpenAICitations(text) {
  if (typeof text !== 'string' || text.length === 0) {
    return text;
  }

  // Regex explanation:
  // r"【"          : Matches the literal opening bracket 【
  // r"\d+"         : Matches one or more digits (the main citation number)
  // r"(:\d+)?"     : Optionally matches the colon and one or more digits (for formats like 5:0)
  // r"†source"     : Matches the literal string †source
  // r"】"          : Matches the literal closing bracket 】
  // The 'g' flag ensures that ALL occurrences are replaced globally.
  const customCitationRegex = /cite.*?/g;

  // The .replace() method substitutes all matches with an empty string ("").
  return text.replace(customCitationRegex, "");
}

async function sendEmail(recipient, text) {
  const { error } = await resend.emails.send({
    to: recipient,
    from: "onboarding@resend.dev",
    subject: "Your Small Talk topics",
    html: text
  });

  if (error) {
    console.error(error);
  }
}

function formatEmailHtml(ideas) {
  if (!Array.isArray(ideas) || ideas.length === 0) {
    return '<p style="font-family: Arial, sans-serif; color: #000;">No content available.</p>';
  }

  // 1. Build the list content HTML
  const listItemsHtml = ideas.map(item => `
      <li style="margin-bottom: 10px; ">
          <strong style="font-weight: bold; font-size: 14px;">
              ${item.title}
          </strong>
          <p style="margin-top: 5px; margin-bottom: 5px; color: #333; font-size: 12px; line-height: 1.5;">
              ${item.description}
          </p>
      </li>
  `).join('');


  // 2. Assemble the full email body structure using inline styles for maximum compatibility
  const emailHtml = `
      <div style="font-family: Arial, sans-serif; color: #000000;">              
            <!-- Main Title -->
            <h1 style="color:rgb(160, 0, 0); font-size: 20px; margin: 0 0 15px 0;">
                Daily Topics
            </h1>

            <!-- Content List -->
            <ul style="list-style-type: disc; margin: 0; padding: 0 0 0 20px;">
                ${listItemsHtml}
            </ul>

            <!-- Footer / Separator -->
            <a href='https://small-fe.vercel.app/' style="margin-top: 15px; font-size: 12px; color:rgb(27, 0, 165);">
                Small Talk App
            </a>
      </div>
  `;
  return emailHtml;
}

