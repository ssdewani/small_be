const { Resend } = require('resend');
require('dotenv').config();

const resend = new Resend();

async function sendEmail(recipient, text) {
    const { error } = await resend.emails.send({
        to: recipient,
        from: 'Small Talk <dailyfeed@smalltalk.fun>',
        subject: 'Your Daily Topics',
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
            <a href='https://smalltalk.fun/' style="margin-top: 15px; font-size: 12px; color:rgb(27, 0, 165);">
                Small Talk App
            </a>
      </div>
  `;
    return emailHtml;
}

module.exports = { sendEmail, formatEmailHtml };
