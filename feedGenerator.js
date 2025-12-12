const openai = require('openai');
require('dotenv').config();

const client = new openai({
    apiKey: process.env.OPENAI_API_KEY
});

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

module.exports = { generateFeed };
